const Cognito = require("@aws-sdk/client-cognito-identity-provider");

const clientId = "gcuu9h0ce7dj7f9k7f76mffbs"; // Obtain from the AWS console

// Get the username, password, and email from command-line arguments
const username = process.argv[2];
const password = process.argv[3];
const email = process.argv[4];

async function main() {
  console.log("Signing up user:", username, email); // Log user details (avoid logging passwords in production)
  const client = new Cognito.CognitoIdentityProviderClient({ region: 'ap-southeast-2' });
  const command = new Cognito.SignUpCommand({
    ClientId: clientId,
    Username: username,
    Password: password,
    UserAttributes: [{ Name: "email", Value: email }], // Include email attribute
  });
  
  try {
    const res = await client.send(command);
    console.log("Sign up successful:", res);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1); // Exit with an error code
  }
}

main();