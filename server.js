const express = require('express');
const { createHmac } = require("crypto");

const app = express();

const { google } = require('googleapis');
const credentials = require('./credentials.json');
const scopes = [
  'https://www.googleapis.com/auth/drive'
];

const auth = new google.auth.JWT(
    credentials.client_email, null,
    credentials.private_key, scopes
);
const drive = google.drive({ version: "v3", auth });

app.use(
    express.json({
      verify: (request, response, buffer) => {
        request.rawBody = buffer.toString();
      },
    })
);

app.post('/content/resources/find', listPhotosFromDrive);

function listPhotosFromDrive(request, response) {
  if (!isValidPostRequest(process.env.CLIENT_SECRET, request)) {
    response.sendStatus(401);
    return;
  }

  const nextPageToken = request.body.continuation || '';

  drive.files.list({
    pageToken: nextPageToken,
    pageSize: 5,
    fields: 'nextPageToken, files(id, name, thumbnailLink, webContentLink)',
    orderBy: 'createdTime desc'
  }, (err, res) => {
    if (err) throw err;
    const files = res.data.files;

    if (files.length) {
      const resources = files
          .filter(file => file.webContentLink)
          .map((file) => {
            const imageUrl = fromProxy(file.webContentLink)
            return {
              type: 'IMAGE',
              id: file.id,
              name: file.name,
              thumbnail: {
                url: imageUrl,
              },
              url: imageUrl,
              contentType: 'image/jpeg',
            }
          })

      response.send({
        type: 'SUCCESS',
        continuation: res.data.nextPageToken,
        resources,
      });

    } else {
      console.log('No files found');

      response.send({
        type: 'FAILED'
      });
    }
  })
}

const isValidPostRequest = (secret, request) => {
  // Verify the timestamp
  const sentAtSeconds = request.header("X-Canva-Timestamp");
  const receivedAtSeconds = new Date().getTime() / 1000;

  if (!isValidTimestamp(sentAtSeconds, receivedAtSeconds)) {
    console.log('wow invalid timestamp')
    return false;
  }

  // Construct the message
  const version = "v1";
  const timestamp = request.header("X-Canva-Timestamp");
  const path = getPathForSignatureVerification(request.path);
  const body = request.rawBody;
  const message = `${version}:${timestamp}:${path}:${body}`;

  // Calculate a signature
  const signature = calculateSignature(secret, message);

  // Reject requests with invalid signatures
  if (!request.header("X-Canva-Signatures").includes(signature)) {
    console.log('wow invalid signature')
    return false;
  }

  return true;
};

const isValidTimestamp = (
    sentAtSeconds,
    receivedAtSeconds,
    leniencyInSeconds = 300
) => {
  return (
      Math.abs(Number(sentAtSeconds) - Number(receivedAtSeconds)) <
      Number(leniencyInSeconds)
  );
};

const getPathForSignatureVerification = (input) => {
  const paths = [
    "/configuration",
    "/configuration/delete",
    "/content/resources/find",
    "/editing/image/process",
    "/editing/image/process/get",
    "/publish/resources/find",
    "/publish/resources/get",
    "/publish/resources/upload",
  ];

  return paths.find((path) => input.endsWith(path));
};

const calculateSignature = (secret, message) => {
  // Decode the client secret
  const key = Buffer.from(secret, "base64");

  // Calculate the signature
  return createHmac("sha256", key).update(message).digest("hex");
};


function fromProxy(url) {
  return 'https://res.cloudinary.com/duw3ba6fo/image/fetch/' + encodeURIComponent(url.replace('&export=download', ''));
}


app.listen(process.env.PORT || 3000);