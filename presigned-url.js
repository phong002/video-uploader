// Import the necessary AWS SDK modules
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');

// Configure the S3 client with the region
const s3Client = new S3Client({ region: 'ap-southeast-2' });

// Define the bucket name
const bucketName = 'n11452331-s3-bucket';

const listAndGenerateHTML = async () => {
  try {
    const params = {
      Bucket: bucketName,
    };

    // List objects in the bucket
    const data = await s3Client.send(new ListObjectsV2Command(params));
    
    // Filter only .mp4 files
    const mp4Files = data.Contents.filter(obj => obj.Key.endsWith('.mp4'));

    // Generate pre-signed URLs for each .mp4 file
    const videoElements = await Promise.all(mp4Files.map(async (file) => {
      const urlParams = {
        Bucket: bucketName,
        Key: file.Key,
      };
      const url = await getSignedUrl(s3Client, new ListObjectsV2Command(urlParams), { expiresIn: 3600 });
      return `<video width="320" height="240" controls>
                <source src="${url}" type="video/mp4">
                Your browser does not support the video tag.
              </video>`;
    }));

    // Create the HTML content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>S3 Videos</title>
      </head>
      <body>
        <h1>MP4 Videos from S3</h1>
        ${videoElements.join('<br>')}
      </body>
      </html>
    `;

    // Write the HTML content to a file
    fs.writeFileSync('videos.html', htmlContent);
    console.log('HTML file generated: videos.html');

  } catch (err) {
    console.log('Error:', err);
  }
};

// Call the function to list files and generate the HTML
listAndGenerateHTML();
