const { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const secretsManager = new SecretsManagerClient({ region: 'ap-southeast-2' });

async function storeTotpSecret(username, totpSecret) {
    const secretName = 'n11452331-secret';
    
    try {
        // Retrieve the existing secret
        let secretObject = [];
        try {
            const getSecretCommand = new GetSecretValueCommand({ SecretId: secretName });
            const existingSecretData = await secretsManager.send(getSecretCommand);
            secretObject = JSON.parse(existingSecretData.SecretString);
        } catch (error) {
            if (error.name !== 'ResourceNotFoundException') {
                console.error('Error retrieving existing secret:', error);
                throw error;
            }
            // If the secret doesn't exist, we'll create a new one later
        }

        // Ensure secretObject is an array and find the index of the existing user
        if (!Array.isArray(secretObject)) {
            secretObject = [];
        }
        const userIndex = secretObject.findIndex(item => item.user === username);

        // If the user exists, update their totpSecret; otherwise, add a new entry
        if (userIndex >= 0) {
            secretObject[userIndex].totpSecret = totpSecret;
        } else {
            secretObject.push({ user: username, totpSecret: totpSecret });
        }

        // Update the secret in Secrets Manager
        const putSecretCommand = new PutSecretValueCommand({
            SecretId: secretName,
            SecretString: JSON.stringify(secretObject),
        });
        await secretsManager.send(putSecretCommand);

        console.log('TOTP secret stored/updated successfully.');
    } catch (error) {
        console.error('Error storing TOTP secret:', error);
    }
}

async function retrieveTotpSecret(username) {
    const secretName = 'n11452331-secret';
    
    try {
        const getSecretCommand = new GetSecretValueCommand({ SecretId: secretName });
        const data = await secretsManager.send(getSecretCommand);
        
        // Parse the secret's JSON data
        const secretObject = JSON.parse(data.SecretString);
        
        // Ensure the secretObject is an array
        if (!Array.isArray(secretObject)) {
            console.error('The secret is not an array.');
            return null;
        }
        
        // Find the user's TOTP secret in the array
        const userSecret = secretObject.find(item => item.user === username);
        if (userSecret && userSecret.totpSecret) {
            return userSecret.totpSecret;
        } else {
            console.error('TOTP secret not found for user:', username);
            return null;
        }
    } catch (error) {
        console.error('Error retrieving TOTP secret:', error);
        return null;
    }
}

// // Usage example
// retrieveTotpSecret('fisherman').then(secret => {
//     console.log('Retrieved secret:', secret);
// });

// Usage example
// storeTotpSecret('fisherman', '123123');
