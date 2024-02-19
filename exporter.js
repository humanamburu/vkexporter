const https = require('https');
const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = ""
const PEER_ID = "";
const CMID = "";

const VK_API_URL = "https://api.vk.com/method/";
const API_METHOD = "messages.getHistoryAttachments";

const ATTACHMENTS_SIZE = 100;
const DOWNLOAD_CHUNK_SIZE = 5;

const REQUEST_URL = `${VK_API_URL}${API_METHOD}?peer_id=${PEER_ID}&access_token=${ACCESS_TOKEN}&v=5.131`;

const dir = `./download_${Date.now()}`;
fs.mkdirSync(dir);

const chunkArray = (array, chunkSize) => {
    let chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

const download = async (name, url) => {
    const file = fs.createWriteStream(path.join(dir, name));

    return new Promise((resolve, reject) => {
        console.log(`Downloading ${name}`)

        const request = https.get(url, (res) => {
            res.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        });

        request.on('error', (err) => {
            fs.unlink(path.join(dir, name));
            reject(err.message);
        });
    });
};

const downloadPhotos = async (photos) => {
    const chunks = chunkArray(photos, DOWNLOAD_CHUNK_SIZE);

    for (let chunk of chunks) {
        await Promise.all(chunk.map((item, index) => {
            const name = `photo_${item.id}.jpg`

            return download(name, item.url);
        }));
    }
};

const getPhotoUrls = (cmid, next) => {
    return new Promise((resolve, reject) => {
        let url = !next ? `${REQUEST_URL}&cmid=${CMID}` : `${REQUEST_URL}&start_from=${next}`;

        console.log(`Requesting ${url}`);

        https.get(url, (res) => {
            let raw = '';

            res.on('data', (chunk) => raw += chunk);
            res.on('end', () => {
                const data = JSON.parse(raw);
                const items = data?.response?.items;

                if (!items) {
                    console.log(data);
                }

                const photoUrls = items
                    ?.filter(item => item.attachment?.type === "photo")
                    .map((item, index) => {
                        return {
                            url: item.attachment?.photo?.sizes?.pop()?.url,
                            id: item.attachment?.photo?.id,
                        }
                    })
                    .filter(item => item.url) || [];

                resolve({photoUrls, next: data.response.next_from});
            });

            res.on('error', reject);
        }).on("error", reject);
    });
};

const dumper = async (cmid = CMID, next = null, total = 0) => {
    const result = await getPhotoUrls(cmid, next);

    if (!result.photoUrls.length) {
        console.log(`Downloaded ${total} photos`);
        return
    }

    await downloadPhotos(result.photoUrls);

    console.log(`Downloaded ${result.photoUrls.length}, next: ${result.next}, total: ${total + result.photoUrls.length}`)
    dumper(cmid, result.next, total + result.photoUrls.length)
};

dumper().catch(console.error);
