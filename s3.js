const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const bucketName = 'n11452331-s3-bucket';

// Initialize the S3 client
const s3Client = new S3Client({ region: 'ap-southeast-2' });

// Function to upload a video to S3 using a buffer
async function uploadToS3(fileBuffer, objectKey) {
    try {
        const response = await s3Client.send(
            new PutObjectCommand({
                Bucket: bucketName,
                Key: objectKey,
                Body: fileBuffer,
                ContentType: 'video/mp4', // Set content type for mp4
            })
        );
        console.log('Upload successful:', response);
    } catch (err) {
        console.log('Error uploading to S3:', err);
        throw err;
    }
}

// Function to list videos in the user's folder and generate presigned URLs
// Assuming this function is in s3.js
async function listUserVideos(username) {
    try {
        const response = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: `${username}/`, // List objects within the user's folder
            })
        );

        // Generate a list of video URLs and names
        const videoData = response.Contents ? response.Contents.map((item) => {
            return {
                url: `https://${bucketName}.s3.${s3Client.config.region}.amazonaws.com/${item.Key}`,
                name: item.Key.split('/').pop() // Extract the filename from the object key
            };
        }) : [];

        return videoData;
    } catch (err) {
        console.error('Error listing videos from S3:', err);
        throw err;
    }
}


module.exports = { uploadToS3, listUserVideos };
