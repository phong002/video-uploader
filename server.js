const express = require('express');
const multer = require('multer');
const session = require('express-session');
const { exec } = require('child_process');
const { uploadToS3, listUserVideos } = require('./s3'); // Import functions from s3.js
const { storeVideoMetadata } = require('./dynamodb'); // Import the DynamoDB function
const { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const secretsManager = new SecretsManagerClient({ region: 'ap-southeast-2' });
const { DeleteObjectCommand } = require('@aws-sdk/client-s3'); // Import the command to delete objects from S3
const { CognitoIdentityProviderClient, AdminListGroupsForUserCommand, InitiateAuthCommand, AuthFlowType } = require('@aws-sdk/client-cognito-identity-provider');

const path = require('path');
const Cognito = require("@aws-sdk/client-cognito-identity-provider");
const qrcode = require('qrcode');
const speakeasy = require('speakeasy');

const app = express();
const PORT = 3000;
const clientId = "gcuu9h0ce7dj7f9k7f76mffbs"; // Replace with your Cognito App Client ID
const userPoolId = 'ap-southeast-2_NfWB7liGw'; // Replace with your User Pool ID
const client = new CognitoIdentityProviderClient({ region: 'ap-southeast-2' });

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

// Endpoint to get the logged-in user's username
app.get('/current-user', (req, res) => {
    if (!req.session.username) {
        return res.status(403).send({ error: 'Not logged in' });
    }

    res.json({
        username: req.session.username,
        userGroups: req.session.userGroups || [] // Return the user groups stored in the session
    });
});


// Serve the signup page
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.post('/signup', (req, res) => {
    const { username, password, email } = req.body;

    // Execute the cognito.js file with the username, password, and email
    exec(`node cognito.js ${username} ${password} ${email}`, async (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${stderr}`);
            return res.send(`Error signing up: ${stderr}`);
        }

        console.log(`Output: ${stdout}`);
        req.session.username = username;

        try {
            const client = new Cognito.CognitoIdentityProviderClient({ region: 'ap-southeast-2' });
            
            // Add user to the StandardUser group
            const addUserToGroupCommand = new Cognito.AdminAddUserToGroupCommand({
                UserPoolId: 'ap-southeast-2_NfWB7liGw', // Replace with your User Pool ID
                Username: username,
                GroupName: 'StandardUser', // Group to which the user is added by default
            });

            await client.send(addUserToGroupCommand);
            console.log(`User ${username} added to group StandardUser.`);

            // Initiate authentication to set up MFA
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

                // Store TOTP secret in Secrets Manager
                await storeTotpSecretInSecretsManager(username, userSecretCode);

                res.redirect('/mfa-setup.html');
            } else {
                console.log("MFA setup not required.");
                res.redirect('/login?success=true');
            }
        } catch (mfaError) {
            console.error("Error during MFA setup or adding user to group:", mfaError);
            res.send('Error during MFA setup or group assignment.');
        }
    });
});

async function storeTotpSecretInSecretsManager(username, totpSecret) {
    const secretName = 'n11452331-secret';
    
    try {
        // Retrieve the existing secrets
        let secrets = [];
        try {
            const getSecretCommand = new GetSecretValueCommand({ SecretId: secretName });
            const existingSecretData = await secretsManager.send(getSecretCommand);
            secrets = JSON.parse(existingSecretData.SecretString);
        } catch (error) {
            if (error.name !== 'ResourceNotFoundException') {
                console.error('Error retrieving existing secrets:', error);
                throw error;
            }
            // If the secret doesn't exist, initialize an empty array
        }

        // Ensure the secrets are stored in an array format and find the user's entry
        if (!Array.isArray(secrets)) {
            secrets = [];
        }
        const userIndex = secrets.findIndex(item => item.user === username);

        // If user exists, update their totpSecret; otherwise, add a new entry
        if (userIndex >= 0) {
            secrets[userIndex].totpSecret = totpSecret;
        } else {
            secrets.push({ user: username, totpSecret: totpSecret });
        }

        // Store the updated secrets array in Secrets Manager
        const putSecretCommand = new PutSecretValueCommand({
            SecretId: secretName,
            SecretString: JSON.stringify(secrets),
        });
        await secretsManager.send(putSecretCommand);

        console.log('TOTP secret stored/updated successfully in Secrets Manager.');
    } catch (error) {
        console.error('Error storing TOTP secret in Secrets Manager:', error);
    }
}

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

async function retrieveTotpSecretFromSecretsManager(username) {
    const secretName = 'n11452331-secret';
    
    try {
        const getSecretCommand = new GetSecretValueCommand({ SecretId: secretName });
        const data = await secretsManager.send(getSecretCommand);
        const secrets = JSON.parse(data.SecretString);

        // Find the user's TOTP secret in the array
        const userSecret = secrets.find(item => item.user === username);
        if (userSecret && userSecret.totpSecret) {
            return userSecret.totpSecret;
        } else {
            console.error('TOTP secret not found for user:', username);
            return null;
        }
    } catch (error) {
        console.error('Error retrieving TOTP secret from Secrets Manager:', error);
        return null;
    }
}

app.post('/verify-totp', async (req, res) => {
    const { totp } = req.body;

    const username = req.session.username;
    if (!username) {
        return res.status(403).send('Not logged in');
    }

    try {
        // Retrieve the TOTP secret from Secrets Manager
        const storedTotpSecret = await retrieveTotpSecretFromSecretsManager(username);

        if (!storedTotpSecret) {
            return res.status(400).send('TOTP secret not found.');
        }

        const verified = speakeasy.totp.verify({
            secret: storedTotpSecret,
            encoding: 'base32',
            token: totp,
        });

        if (verified) {
            req.session.isTotpVerified = true; // Mark the user as TOTP verified
            res.redirect('/'); // Redirect to the main page
        } else {
            res.status(400).send('Invalid TOTP.');
        }
    } catch (error) {
        console.error('Error during TOTP verification:', error);
        res.status(500).send('Error during TOTP verification.');
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    exec(`node authenticate.js ${username} ${password}`, async (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${stderr}`);
            return res.redirect('/login?error=true');
        }

        const statusCode = parseInt(stdout.trim(), 10);
        if (statusCode === 200) {
            req.session.username = username;

            // Get user groups from Cognito
            try {
                const params = {
                    UserPoolId: 'ap-southeast-2_NfWB7liGw', // Your User Pool ID
                    Username: username,
                };
                const command = new Cognito.AdminListGroupsForUserCommand(params);
                
                const groupData = await client.send(command);

                // Store user groups in the session
                req.session.userGroups = groupData.Groups.map(group => group.GroupName);

                // Check if TOTP (MFA) is required
                const initiateAuthCommand = new Cognito.InitiateAuthCommand({
                    AuthFlow: Cognito.AuthFlowType.USER_PASSWORD_AUTH,
                    AuthParameters: {
                        USERNAME: username,
                        PASSWORD: password,
                    },
                    ClientId: clientId,
                });

                const authRes = await client.send(initiateAuthCommand);

                if (authRes.ChallengeName === 'SOFTWARE_TOKEN_MFA' || authRes.ChallengeName === 'MFA_SETUP') {
                    req.session.isTotpVerified = false;
                    return res.redirect('/totp.html');
                }

                // If no MFA is required, mark the user as verified
                req.session.isTotpVerified = true;
                res.redirect('/');
            } catch (groupError) {
                console.error('Error retrieving user groups:', groupError);
                res.redirect('/login?error=true');
            }
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
        return res.redirect('/login'); // Redirect to login if not signed in or TOTP not verified
    }

    try {
        // Render the upload page
        res.sendFile(path.join(__dirname, 'public', 'upload.html'));
    } catch (error) {
        console.error('Error loading the upload page:', error);
        res.status(500).send('Error loading the upload page.');
    }
});


// API endpoint to get the list of user videos
app.get('/videos', async (req, res) => {
    if (!req.session.username) {
        return res.status(403).send('Not logged in');
    }

    try {
        // Retrieve the list of videos for the logged-in user
        const videoData = await listUserVideos(req.session.username);
        res.json(videoData); // Return an array of objects with URLs and names
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

// Endpoint to delete a video (admin users only)
app.delete('/videos/:videoName', async (req, res) => {
    if (!req.session.username || !req.session.userGroups || !req.session.userGroups.includes('Admin')) {
        return res.status(403).send('Access denied: Admins only.');
    }

    const videoName = req.params.videoName;
    const objectKey = `${req.session.username}/${videoName}`;

    try {
        // Delete the video from the S3 bucket
        const deleteParams = {
            Bucket: bucketName,
            Key: objectKey,
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));

        console.log(`Video ${videoName} deleted successfully.`);
        res.status(200).send(`Video ${videoName} deleted successfully.`);
    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).send('Error deleting video.');
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
