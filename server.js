const express = require('express');
const multer = require('multer');
const session = require('express-session');
const { exec } = require('child_process');
const { uploadToS3, listUserVideos } = require('./s3'); // Import functions from s3.js
const { storeVideoMetadata } = require('./dynamodb'); // Import the DynamoDB function
const path = require('path');
const Cognito = require("@aws-sdk/client-cognito-identity-provider");
const qrcode = require('qrcode');
const speakeasy = require('speakeasy');

const app = express();
const PORT = 3000;
const clientId = "gcuu9h0ce7dj7f9k7f76mffbs"; // Replace with your Cognito App Client ID
const userPoolId = 'ap-southeast-2_NfWB7liGw'; // Replace with your User Pool ID

// Store the user's secret code temporarily (in-memory storage, not for production)
let userSecretCode = '';

// Set up session management
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// Parse URL-encoded bodies (for form data) and JSON data for AJAX requests
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set up multer to use memory storage (does not save files to disk)
const upload = multer({ storage: multer.memoryStorage() });

// Serve static files (e.g., login.html, signup.html, mfa-setup.html) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve the signup page
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Handle sign-up form submission
app.post('/signup', (req, res) => {
    const { username, password, email } = req.body;

    // Execute the signUp.js file with the username, password, and email
    exec(`node signUp.js ${username} ${password} ${email}`, async (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${stderr}`);
            return res.send(`Error signing up: ${stderr}`);
        }

        console.log(`Output: ${stdout}`);

        req.session.username = username;

        try {
            const client = new Cognito.CognitoIdentityProviderClient({ region: 'ap-southeast-2' });
            const initiateAuthCommand = new Cognito.InitiateAuthCommand({
                AuthFlow: Cognito.AuthFlowType.USER_PASSWORD_AUTH,
                AuthParameters: {
                    USERNAME: username,
                    PASSWORD: password,
                },
                ClientId: clientId,
            });

            const authRes = await client.send(initiateAuthCommand);

            if (authRes.ChallengeName === 'MFA_SETUP' || authRes.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
                const session = authRes.Session;

                // Associate software token for MFA
                const associateCommand = new Cognito.AssociateSoftwareTokenCommand({
                    Session: session,
                });
                const associateRes = await client.send(associateCommand);
                userSecretCode = associateRes.SecretCode;

                console.log("MFA setup initialized. Secret Code:", userSecretCode);
                res.redirect('/mfa-setup.html');
            } else {
                console.log("MFA setup not required.");
                res.redirect('/login?success=true');
            }
        } catch (mfaError) {
            console.error("Error during MFA setup:", mfaError);
            res.send('Error during MFA setup.');
        }
    });
});

// Endpoint to generate and return the MFA QR code data URL
app.get('/mfa-setup-qr', (req, res) => {
    if (!userSecretCode) {
        return res.status(400).json({ error: 'MFA setup not initialized.' });
    }

    const username = req.session.username;

    const totpUri = `otpauth://totp/${encodeURIComponent(username)}?secret=${userSecretCode}&issuer=${encodeURIComponent('Video Upload App')}`;
    qrcode.toDataURL(totpUri, (err, url) => {
        if (err) {
            console.error('Error generating QR code:', err);
            return res.status(500).json({ error: 'Failed to generate QR code.' });
        }
        res.json({ qrCodeUrl: url });
    });
});

// Handle TOTP verification
app.post('/verify-totp', (req, res) => {
    const { totp } = req.body;

    const verified = speakeasy.totp.verify({
        secret: userSecretCode,
        encoding: 'base32',
        token: totp
    });

    if (verified) {
        // Mark the user as authenticated and redirect to the home page
        req.session.isTotpVerified = true;
        res.status(200).send('TOTP verified successfully.');
    } else {
        res.status(400).send('Invalid TOTP.');
    }
});

// Handle login form submission
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Execute authenticate.js with username and password
    exec(`node authenticate.js ${username} ${password}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${stderr}`);
            return res.redirect('/login?error=true');
        }

        const statusCode = parseInt(stdout.trim(), 10);
        if (statusCode === 200) {
            req.session.username = username;
            // Redirect to TOTP verification page after successful login
            res.redirect('/totp.html');
        } else {
            res.redirect('/login?error=true');
        }
    });
});

// Handle logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Serve the upload page (restricted to logged-in users with verified TOTP)
app.get('/', async (req, res) => {
    if (!req.session.username || !req.session.isTotpVerified) {
        return res.redirect('/login');
    }

    try {
        // Retrieve the list of videos for the logged-in user
        // await listUserVideos(req.session.username);
        res.sendFile(path.join(__dirname, 'public', 'upload.html'));
    } catch (error) {
        console.error('Error retrieving videos:', error);
        res.status(500).send('Error retrieving videos.');
    }
});

// API endpoint to get the list of user videos
app.get('/videos', async (req, res) => {
    if (!req.session.username) {
        return res.status(403).send('Not logged in');
    }

    try {
        // Retrieve the list of videos for the logged-in user
        const videoUrls = await listUserVideos(req.session.username);
        res.json(videoUrls);
    } catch (error) {
        console.error('Error retrieving videos:', error);
        res.status(500).send('Error retrieving videos.');
    }
});

// Handle file upload (restricted to logged-in users)
app.post('/upload', upload.single('video'), async (req, res) => {
    if (!req.session.username) {
        return res.status(403).send('Not logged in');
    }

    const objectKey = `${req.session.username}/${req.file.originalname}`;
    const videoMetadata = {
        username: req.session.username,
        filename: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadTime: new Date().toISOString(),
    };

    try {
        // Upload to S3 using file buffer
        await uploadToS3(req.file.buffer, objectKey);
        
        // Store metadata in DynamoDB
        await storeVideoMetadata(videoMetadata);

        res.status(200).send('Upload successful and metadata stored in DynamoDB!');
    } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Error uploading to S3 or storing metadata in DynamoDB');
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
