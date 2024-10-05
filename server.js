// const express = require('express');
// const multer = require('multer');
// const path = require('path');
// const fs = require('fs');
// const session = require('express-session');
// const { exec } = require('child_process');
// const { uploadToS3, listUserVideos } = require('./s3'); // Import functions from s3.js
// const { storeVideoMetadata } = require('./dynamodb'); // Import the DynamoDB function

// const app = express();
// const PORT = 3000;

// // Set up session management
// app.use(session({
//     secret: 'secret-key',
//     resave: false,
//     saveUninitialized: true
// }));

// // Parse URL-encoded bodies (for form data) and JSON data for AJAX requests
// app.use(express.urlencoded({ extended: true }));
// app.use(express.json());

// // Set up multer for file uploads with dynamic directory creation based on user
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//         const userDir = path.join(__dirname, 'uploads', req.session.username);
//         if (!fs.existsSync(userDir)) {
//             fs.mkdirSync(userDir, { recursive: true });
//         }
//         cb(null, userDir);
//     },
//     filename: (req, file, cb) => {
//         cb(null, file.originalname);
//     }
// });

// const upload = multer({ storage: storage }); // Define the upload middleware here

// // Serve the login page
// app.get('/login', (req, res) => {
//     res.sendFile(path.join(__dirname, 'html', 'login.html'));
// });

// // Serve the signup page
// app.get('/signup', (req, res) => {
//     res.sendFile(path.join(__dirname, 'html', 'signup.html'));
// });

// // Handle sign-up form submission
// app.post('/signup', (req, res) => {
//     const { username, password, email } = req.body;

//     // Execute the signUp.js file with the username, password, and email
//     exec(`node signUp.js ${username} ${password} ${email}`, (error, stdout, stderr) => {
//         if (error) {
//             console.error(`Error: ${stderr}`);
//             return res.send(`Error signing up: ${stderr}`);
//         }

//         console.log(`Output: ${stdout}`);
//         res.redirect('/login?success=true');
//     });
// });

// // Handle login form submission
// app.post('/login', (req, res) => {
//     const { username, password } = req.body;

//     // Execute authenticate.js with username and password
//     exec(`node authenticate.js ${username} ${password}`, (error, stdout, stderr) => {
//         if (error) {
//             console.error(`Error: ${stderr}`);
//             return res.redirect('/login?error=true');
//         }

//         const statusCode = parseInt(stdout.trim(), 10);
//         if (statusCode === 200) {
//             req.session.username = username;
//             res.redirect('/');
//         } else {
//             res.redirect('/login?error=true');
//         }
//     });
// });

// // Handle logout
// app.get('/logout', (req, res) => {
//     req.session.destroy();
//     res.redirect('/login');
// });

// // Serve the upload page (restricted to logged-in users)
// app.get('/', async (req, res) => {
//     if (!req.session.username) {
//         return res.redirect('/login');
//     }

//     try {
//         // Retrieve the list of videos for the logged-in user
//         const videoUrls = await listUserVideos(req.session.username);
//         res.sendFile(path.join(__dirname, 'html', 'upload.html'));
//     } catch (error) {
//         console.error('Error retrieving videos:', error);
//         res.status(500).send('Error retrieving videos.');
//     }
// });

// // API endpoint to get the list of user videos
// app.get('/videos', async (req, res) => {
//     if (!req.session.username) {
//         return res.status(403).send('Not logged in');
//     }

//     try {
//         // Retrieve the list of videos for the logged-in user
//         const videoUrls = await listUserVideos(req.session.username);
//         res.json(videoUrls);
//     } catch (error) {
//         console.error('Error retrieving videos:', error);
//         res.status(500).send('Error retrieving videos.');
//     }
// });

// // Handle file upload (restricted to logged-in users)
// app.post('/upload', upload.single('video'), async (req, res) => {
//     if (!req.session.username) {
//         return res.status(403).send('Not logged in');
//     }

//     const filePath = req.file.path;
//     const objectKey = `${req.session.username}/${req.file.filename}`;
//     const videoMetadata = {
//         username: req.session.username,
//         filename: req.file.filename,
//         size: req.file.size,
//         mimeType: req.file.mimetype,
//         uploadTime: new Date().toISOString(),
//     };

//     try {
//         // Upload to S3
//         await uploadToS3(filePath, objectKey);
        
//         // Store metadata in DynamoDB
//         await storeVideoMetadata(videoMetadata);

//         res.status(200).send('Upload successful and metadata stored in DynamoDB!');
//     } catch (err) {
//         console.error('Error:', err);
//         res.status(500).send('Error uploading to S3 or storing metadata in DynamoDB');
//     }
// });

// // Serve uploaded videos statically
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// // Start the server
// app.listen(PORT, () => {
//     console.log(`Server is running on port ${PORT}`);
// });


const express = require('express');
const multer = require('multer');
const session = require('express-session');
const { exec } = require('child_process');
const { uploadToS3, listUserVideos } = require('./s3'); // Import functions from s3.js
const { storeVideoMetadata } = require('./dynamodb'); // Import the DynamoDB function
const path = require('path');

const app = express();
const PORT = 3000;

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

// Serve the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'html', 'login.html'));
});

// Serve the signup page
app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'html', 'signup.html'));
});

// Handle sign-up form submission
app.post('/signup', (req, res) => {
    const { username, password, email } = req.body;

    // Execute the signUp.js file with the username, password, and email
    exec(`node signUp.js ${username} ${password} ${email}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${stderr}`);
            return res.send(`Error signing up: ${stderr}`);
        }

        console.log(`Output: ${stdout}`);
        res.redirect('/login?success=true');
    });
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
            res.redirect('/');
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

// Serve the upload page (restricted to logged-in users)
app.get('/', async (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    try {
        // Retrieve the list of videos for the logged-in user
        await listUserVideos(req.session.username);
        res.sendFile(path.join(__dirname, 'html', 'upload.html'));
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
