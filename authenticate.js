const Cognito = require("@aws-sdk/client-cognito-identity-provider");
const jwt = require("aws-jwt-verify");

const userPoolId = "ap-southeast-2_NfWB7liGw";
const clientId = "gcuu9h0ce7dj7f9k7f76mffbs";

// Get username and password from command-line arguments
const username = process.argv[2];
const password = process.argv[3];

const accessVerifier = jwt.CognitoJwtVerifier.create({
  userPoolId: userPoolId,
  tokenUse: "access",
  clientId: clientId,
});

const idVerifier = jwt.CognitoJwtVerifier.create({
  userPoolId: userPoolId,
  tokenUse: "id",
  clientId: clientId,
});

async function main() {
  const client = new Cognito.CognitoIdentityProviderClient({
    region: "ap-southeast-2",
  });

  // Get authentication tokens from the Cognito API using username and password
  const command = new Cognito.InitiateAuthCommand({
    AuthFlow: Cognito.AuthFlowType.USER_PASSWORD_AUTH,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
    ClientId: clientId,
  });

  try {
    const res = await client.send(command);
    // Log the HTTP status code
    console.log(res.$metadata.httpStatusCode);
    process.exit(0); // Exit with a success status code
  } catch (error) {
    console.error("Error during authentication:", error);
    process.exit(1); // Exit with a failure status code
  }
}

main();
