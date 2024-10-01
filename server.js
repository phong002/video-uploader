const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const PORT = 3000;

// Set up session management
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// Parse URL-encoded bodies (for form data)
app.use(express.urlencoded({ extended: true }));

// Load user credentials
const users = JSON.parse(fs.readFileSync('users.json')).users;

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

const upload = multer({ storage: storage });

// Serve the login form
app.get('/login', (req, res) => {
    const error = req.query.error ? 'Invalid credentials. Please try again.' : '';
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login</title>
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
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
                }
                input {
                    display: block;
                    width: 80%;
                    margin: 10px auto;
                    padding: 10px;
                    font-size: 16px;
                    border-radius: 4px;
                    border: 1px solid #ccc;
                }
                button {
                    padding: 10px 20px;
                    font-size: 16px;
                    cursor: pointer;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    margin-top: 10px;
                }
                button:hover {
                    background-color: #0056b3;
                }
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
            </div>
            <script>
                const error = "${error}";
                if (error) {
                    alert(error);
                }
            </script>
        </body>
        </html>
    `);
});


// Handle login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        req.session.username = username;
        res.redirect('/');
    } else {
        res.redirect('/login?error=true');
    }
});

// Handle logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Serve the HTML upload form (restricted to logged-in users)
app.get('/', (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Video Upload</title>
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
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
                }
                input[type="file"] {
                    margin: 10px 0;
                }
                button {
                    padding: 10px 20px;
                    font-size: 16px;
                    cursor: pointer;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    margin: 10px;
                }
                button:hover {
                    background-color: #0056b3;
                }
                .username {
                    margin-bottom: 20px;
                    font-size: 18px;
                    color: #333;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="username">Logged in as: ${req.session.username}</div>
                <h1>Upload a Video</h1>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="file" name="video" accept="video/*" required>
                    <button type="submit">Upload</button>
                </form>
                <button onclick="window.location.href='/videos'">View Uploaded Videos</button>
                <button onclick="window.location.href='/logout'">Logout</button>
            </div>
        </body>
        </html>
    `);
});

// Handle file upload (restricted to logged-in users)
app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Upload Successful</title>
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
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
                }
                button {
                    padding: 10px 20px;
                    font-size: 16px;
                    cursor: pointer;
                    background-color: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    margin: 10px;
                }
                button:hover {
                    background-color: #0056b3;
                }
                .username {
                    margin-bottom: 20px;
                    font-size: 18px;
                    color: #333;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="username">Logged in as: ${req.session.username}</div>
                <h1>Upload Successful</h1>
                <button onclick="window.location.href='/'">Return to Home</button>
                <button onclick="window.location.href='/videos'">View Uploaded Videos</button>
            </div>
        </body>
        </html>
    `);
});

// Serve a list of uploaded videos (restricted to logged-in users)
app.get('/videos', (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    const userDir = path.join(__dirname, 'uploads', req.session.username);
    if (!fs.existsSync(userDir)) {
        return res.send('No videos uploaded.');
    }

    fs.readdir(userDir, (err, files) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error reading uploaded files.');
        }

        const videoList = files.map(file => {
            return `
                <div class="video-item">
                    <video width="320" height="240" controls>
                        <source src="/uploads/${req.session.username}/${file}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                    <p>${file}</p>
                    <form action="/delete-video" method="POST" style="display: inline;">
                        <input type="hidden" name="filename" value="${file}">
                        <button type="submit" class="delete-button">Delete</button>
                    </form>
                </div>
            `;
        }).join('');

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Uploaded Videos</title>
                <style>
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
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
                    }
                    .video-item {
                        margin: 20px 0;
                    }
                    video {
                        border-radius: 8px;
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                    }
                    button {
                        padding: 5px 10px;
                        font-size: 14px;
                        cursor: pointer;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        margin-top: 5px;
                    }
                    /* Blue "Return to Home" button */
                    .home-button {
                        background-color: #007bff;
                    }
                    .home-button:hover {
                        background-color: #0056b3;
                    }
                    /* Red "Delete" button */
                    .delete-button {
                        background-color: #dc3545;
                    }
                    .delete-button:hover {
                        background-color: #c82333;
                    }
                    .username {
                        margin-bottom: 20px;
                        font-size: 18px;
                        color: #333;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="username">Logged in as: ${req.session.username}</div>
                    <h1>Uploaded Videos</h1>
                    ${videoList}
                    <button class="home-button" onclick="window.location.href='/'">Return to Home</button>
                </div>
            </body>
            </html>
        `);
    });
});



app.post('/delete-video', (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }

    const { filename } = req.body;
    const filePath = path.join(__dirname, 'uploads', req.session.username, filename);

    // Delete the file
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error deleting the video.');
        }

        // Redirect back to the videos page
        res.redirect('/videos');
    });
});

// Serve uploaded videos statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
