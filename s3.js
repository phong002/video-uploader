const S3 = require("@aws-sdk/client-s3");
const fs = require('fs');
const path = require('path');

const bucketName = 'n11452331-s3-bucket';

// Function to upload a video to S3
async function uploadToS3(filePath, objectKey) {
    const s3Client = new S3.S3Client({ region: 'ap-southeast-2' });

    try {
        const fileStream = fs.createReadStream(filePath);
        
        const response = await s3Client.send(
            new S3.PutObjectCommand({
                Bucket: bucketName,
                Key: objectKey,
                Body: fileStream,
                ContentType: 'video/mp4' // Set content type for mp4
            })
        );
        console.log('Upload successful:', response);
    } catch (err) {
        console.log('Error uploading to S3:', err);
        throw err;
    }
}

// Function to list videos in the user's folder
async function listUserVideos(username) {
    const s3Client = new S3.S3Client({ region: 'ap-southeast-2' });

    try {
        const response = await s3Client.send(
            new S3.ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: `${username}/`, // Only list objects in the user's folder
            })
        );

        // Extract the URLs of the videos
        const videoUrls = response.Contents ? response.Contents.map((item) => {
            return `https://${bucketName}.s3.${s3Client.config.region}.amazonaws.com/${item.Key}`;
        }) : [];

        return videoUrls;
    } catch (err) {
        console.log('Error listing videos from S3:', err);
        throw err;
    }
}

module.exports = { uploadToS3, listUserVideos };
