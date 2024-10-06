const Cognito = require("@aws-sdk/client-cognito-identity-provider");
const qrcode = require('qrcode');

const clientId = "gcuu9h0ce7dj7f9k7f76mffbs"; // Obtain from the AWS console

// Get the username, password, and email from command-line arguments
const username = process.argv[2];
const password = process.argv[3];
const email = process.argv[4];

async function main() {
  console.log("Signing up user:", username, email); // Log user details (avoid logging passwords in production)
  const client = new Cognito.CognitoIdentityProviderClient({ region: 'ap-southeast-2' });

  // Sign up the user
  const signUpCommand = new Cognito.SignUpCommand({
    ClientId: clientId,
    Username: username,
    Password: password,
    UserAttributes: [{ Name: "email", Value: email }], // Include email attribute
  });

  try {
    const signUpRes = await client.send(signUpCommand);
    console.log("Sign up successful:", signUpRes);

    // After successful sign up, confirm the user to allow MFA setup
    const confirmCommand = new Cognito.AdminConfirmSignUpCommand({
      UserPoolId: 'ap-southeast-2_NfWB7liGw', // Replace with your User Pool ID
      Username: username,
    });

    await client.send(confirmCommand);
    console.log("User confirmed.");

    // Set up MFA
    const initiateAuthCommand = new Cognito.InitiateAuthCommand({
      AuthFlow: Cognito.AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
      ClientId: clientId,
    });

    const authRes = await client.send(initiateAuthCommand);
    
    if (authRes.ChallengeName === 'MFA_SETUP' || authRes.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      const session = authRes.Session;

      // Associate software token for MFA
      const associateCommand = new Cognito.AssociateSoftwareTokenCommand({
        Session: session,
      });
      const associateRes = await client.send(associateCommand);
      const secretCode = associateRes.SecretCode;

      console.log("MFA Secret Code:", secretCode);

      // Generate and display QR code for MFA
      const totpUri = `otpauth://totp/${encodeURIComponent(username)}?secret=${secretCode}&issuer=${encodeURIComponent('YourAppName')}`;
      qrcode.toDataURL(totpUri, (err, url) => {
        if (err) {
          console.error('Error generating QR code:', err);
          process.exit(1);
        }
        console.log("Scan this QR code with Google Authenticator:");
        console.log(url); // You can display this in an HTML page or save it as an image file
      });
    } else {
      console.log("MFA setup not required.");
    }
  } catch (error) {
    console.error("Error during sign-up or MFA setup:", error);
    process.exit(1); // Exit with an error code
  }
}

main();
