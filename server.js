const express = require('express');

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

app.use(express.json());

app.post('/content/resources/find', listPhotosFromDrive);

function listPhotosFromDrive(request, response) {

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

function fromProxy(url) {
  return 'https://res.cloudinary.com/duw3ba6fo/image/fetch/' + encodeURIComponent(url.replace('&export=download', ''));
}

app.listen(process.env.PORT || 3000);