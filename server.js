const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { exec } = require('child_process');
const { uploadToS3, listUserVideos } = require('./s3'); // Import functions from s3.js
const { storeVideoMetadata } = require('./dynamodb'); // Import the DynamoDB function

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

// Set up multer for file uploads with dynamic directory creation based on user
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userDir = path.join(__dirname, 'uploads', req.session.username);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage }); // Define the upload middleware here

// Serve the login form
app.get('/login', (req, res) => {
    const error = req.query.error ? 'Invalid credentials. Please try again.' : '';
    const success = req.query.success ? 'Registration successful! Please log in.' : '';
    
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login</title>
            <style>
                /* Styling omitted for brevity */
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Login</h1>
                <form action="/login" method="POST">
                    <input type="text" name="username" placeholder="Username" required>
                    <input type="password" name="password" placeholder="Password" required>
                    <button type="submit">Login</button>
                </form>
                <button onclick="window.location.href='/signup'">Sign Up</button>
            </div>
            <script>
                const error = "${error}";
                const success = "${success}";
                
                if (error) {
                    alert(error);
                }
                if (success) {
                    alert(success);
                }
            </script>
        </body>
        </html>
    `);
});

// Serve the sign-up form
app.get('/signup', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sign Up</title>
            <style>
                /* Styling omitted for brevity */
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Sign Up</h1>
                <form action="/signup" method="POST">
                    <input type="text" name="username" placeholder="Username" required>
                    <input type="password" name="password" placeholder="Password" required>
                    <input type="email" name="email" placeholder="Email" required>
                    <button type="submit">Sign Up</button>
                </form>
            </div>
        </body>
        </html>
    `);
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

// Serve the HTML upload form (restricted to logged-in users)
app.get('/', async (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    let videoUrls = [];
    try {
        // Retrieve the list of videos for the logged-in user
        videoUrls = await listUserVideos(req.session.username);
    } catch (error) {
        console.error('Error retrieving videos:', error);
    }

    // Generate the HTML for the list of videos
    const videoListHtml = videoUrls.map(url => `
        <div class="video-item">
            <video width="320" height="240" controls>
                <source src="${url}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
        </div>
    `).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Video Upload</title>
            <style>
                /* Styling for the upload form, progress bar, and video list */
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    flex-direction: column;
                    height: 100vh;
                    margin: 0;
                    font-family: Arial, sans-serif;
                    background-color: #f0f0f0;
                }
                .container {
                    text-align: center;
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                    max-width: 400px;
                    width: 100%;
                    margin-bottom: 20px;
                }
                .video-list {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .video-item {
                    margin-top: 20px;
                }
                #progress-container {
                    display: none;
                    margin-top: 20px;
                }
                #progress-bar {
                    width: 0%;
                    height: 20px;
                    background-color: #007bff;
                    border-radius: 5px;
                }
                .logout-btn {
                    margin-top: 20px;
                    padding: 10px 20px;
                    background-color: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="username">Logged in as: ${req.session.username}</div>
                <h1>Upload a Video</h1>
                <form id="upload-form" enctype="multipart/form-data">
                    <input type="file" name="video" accept="video/*" required>
                    <button type="submit">Upload</button>
                </form>
                <div id="progress-container">
                    <div id="progress-bar"></div>
                </div>
                <button class="logout-btn" onclick="window.location.href='/logout'">Logout</button>
            </div>

            <div class="container video-list">
                <h2>Your Uploaded Videos</h2>
                ${videoListHtml || '<p>No videos uploaded yet.</p>'}
            </div>

            <script>
                document.getElementById('upload-form').addEventListener('submit', function(event) {
                    event.preventDefault();

                    const formData = new FormData(this);
                    const xhr = new XMLHttpRequest();

                    xhr.open('POST', '/upload', true);

                    // Update the progress bar
                    xhr.upload.onprogress = function(event) {
                        if (event.lengthComputable) {
                            const percentComplete = (event.loaded / event.total) * 100;
                            const progressBar = document.getElementById('progress-bar');
                            progressBar.style.width = percentComplete + '%';
                            document.getElementById('progress-container').style.display = 'block';
                        }
                    };

                    // Handle the response
                    xhr.onload = function() {
                        if (xhr.status === 200) {
                            alert('Upload successful!');
                            location.reload(); // Reload the page to show updated video list
                        } else {
                            alert('Upload failed!');
                            document.getElementById('progress-container').style.display = 'none';
                            document.getElementById('progress-bar').style.width = '0%';
                        }
                    };

                    // Send the request
                    xhr.send(formData);
                });
            </script>
        </body>
        </html>
    `);
});

// Handle file upload (restricted to logged-in users)
app.post('/upload', upload.single('video'), async (req, res) => {
    if (!req.session.username) {
        return res.status(403).send('Not logged in');
    }

    const filePath = req.file.path;
    const objectKey = `${req.session.username}/${req.file.filename}`;
    const videoMetadata = {
        username: req.session.username,
        filename: req.file.filename,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadTime: new Date().toISOString(),
    };

    try {
        // Upload to S3
        await uploadToS3(filePath, objectKey);
        
        // Store metadata in DynamoDB
        await storeVideoMetadata(videoMetadata);

        res.status(200).send('Upload successful and metadata stored in DynamoDB!');
    } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Error uploading to S3 or storing metadata in DynamoDB');
    }
});

// Serve uploaded videos statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
