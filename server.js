const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Serve the HTML upload form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle file upload
app.post('/upload', upload.single('video'), (req, res) => {
    try {
        const tempPath = req.file.path;
        const targetPath = path.join(__dirname, 'uploads', req.file.originalname);

        // Move the file to the final destination
        fs.rename(tempPath, targetPath, (err) => {
            if (err) return res.status(500).send('Error moving file.');

            // Send the response with centered content, "Return to Home" and "View Uploaded Videos" buttons
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
                        .upload-success-container {
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
                    </style>
                </head>
                <body>
                    <div class="upload-success-container">
                        <h1>Upload Successful</h1>
                        <p>File uploaded to: ${targetPath}</p>
                        <button onclick="window.location.href='/'">Return to Home</button>
                        <button onclick="window.location.href='/videos'">View Uploaded Videos</button>
                    </div>
                </body>
                </html>
            `);
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while uploading the video.');
    }
});

// Serve a list of uploaded videos
app.get('/videos', (req, res) => {
    fs.readdir(path.join(__dirname, 'uploads'), (err, files) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error reading uploaded files.');
        }

        const videoList = files.map(file => {
            return `<li><a href="/uploads/${file}" target="_blank">${file}</a></li>`;
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
                    .video-list-container {
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
                        margin-top: 20px;
                    }
                    button:hover {
                        background-color: #0056b3;
                    }
                    ul {
                        list-style-type: none;
                        padding: 0;
                    }
                    li {
                        margin: 10px 0;
                    }
                </style>
            </head>
            <body>
                <div class="video-list-container">
                    <h1>Uploaded Videos</h1>
                    <ul>${videoList}</ul>
                    <button onclick="window.location.href='/'">Return to Home</button>
                </div>
            </body>
            </html>
        `);
    });
});

// Serve uploaded videos statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
