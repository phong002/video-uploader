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
async function listUserVideos(username) {
    try {
        const response = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: `${username}/`, // Only list objects in the user's folder
            })
        );

        // Log the response to inspect the objects returned by S3
        console.log('S3 List Objects Response:', response.Contents);

        // Create a Set to store unique object keys and prevent duplicates
        const uniqueKeys = new Set();

        // Generate presigned URLs for each unique video object
        const videoUrls = response.Contents ? await Promise.all(response.Contents.map(async (item) => {
            if (!uniqueKeys.has(item.Key)) {
                uniqueKeys.add(item.Key); // Add to the Set to keep track of seen keys
                const command = new GetObjectCommand({
                    Bucket: bucketName,
                    Key: item.Key,
                });
                return await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
            }
        })) : [];

        // Filter out any undefined entries in case of duplicates
        return videoUrls.filter(url => url);
    } catch (err) {
        console.log('Error listing videos from S3:', err);
        throw err;
    }
}

module.exports = { uploadToS3, listUserVideos };
