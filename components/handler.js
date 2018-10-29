const fs =  require('fs');
const shelljs = require('shelljs');
const path = require('path');
const request = require('request');
const unzip = require('extract-zip');


function downloadAsync (url, directory, name) {
    return new Promise(resolve => {
        shelljs.mkdir('-p', directory);

        const _request = request(url);

        _request.on('error', function(error) {
            console.log(error.message);
            resolve({
                failed: true,
                asset: {
                    url: url,
                    directory: directory,
                    name: name
                }
            });
        });

        const file = fs.createWriteStream(path.join(directory, name));
        _request.pipe(file);

        file.once('finish', function() {
            console.log("Downloaded: " + name);
            resolve({failed: false, asset: null});
        });
    });
}

module.exports.getVersion = function (version) {
    return new Promise(resolve => {
        const manifest = "https://launchermeta.mojang.com/mc/game/version_manifest.json";
        request.get(manifest, function(error, response, body) {
            if (error) resolve(error);

            const parsed = JSON.parse(body);

            for (let desiredVersion in parsed.versions) {
                if(parsed.versions[desiredVersion].id === version) {
                    request.get(parsed.versions[desiredVersion].url, function(error, response, body) {
                        if (error) resolve(error);

                        resolve(JSON.parse(body));
                    });
                }
            }
        });
    });
};

module.exports.getJar = function (version, number, directory) {
    return new Promise(async (resolve)=> {
        await downloadAsync(version.downloads.client.url, directory, `${number}.jar`);

        fs.writeFileSync(path.join(directory, `${number}.json`), JSON.stringify(version, null, 4));

        resolve();
    });
};

module.exports.getAssets = function (directory, version) {
    return new Promise(async(resolve) => {
        const assetsUrl = 'http://resources.download.minecraft.net';
        const failed = [];

        if(!fs.existsSync(path.join(directory, 'assets', 'indexes', `${version.assetIndex.id}.json`))) {
            await downloadAsync(version.assetIndex.url, path.join(directory, 'assets', 'indexes'), `${version.assetIndex.id}.json`);
        }

        const index = require(path.join(directory, 'assets', 'indexes',`${version.assetIndex.id}.json`));

        for(const asset in index.objects) {
            const hash = index.objects[asset].hash;
            const subhash = hash.substring(0,2);
            const assetDirectory = path.join(directory, 'assets', 'objects', subhash);

            if(!fs.existsSync(path.join(assetDirectory, hash))) {
                const download = await downloadAsync(`${assetsUrl}/${subhash}/${hash}`, assetDirectory, hash);

                if(download.failed) failed.push(download.asset);
            }
        }

        // why do we have this? B/c sometimes minecraft's resource site times out!
        if(failed) {
            for (const fail of failed) await downloadAsync(fail.url, fail.directory, fail.name);
        }

        resolve();
    });
};

module.exports.getNatives = function (root, version, os) {
    return new Promise(async(resolve) => {
        const nativeDirectory = path.join(root, "natives", `${Math.floor(Math.random() * 1000000000)}`);
        shelljs.mkdir('-p', nativeDirectory);

        const download = version.libraries.map(async function (lib) {
            if (!lib.downloads.classifiers) return;
            const type = `natives-${os}`;
            const native = lib.downloads.classifiers[type];

            if (native) {
                const name = native.path.split('/').pop();

                await downloadAsync(native.url, nativeDirectory, name);

                unzip(`${path.join(nativeDirectory, name)}`, {dir: nativeDirectory},e => {
                    shelljs.rm(path.join(nativeDirectory, name));
                })
            }
        });

        await Promise.all(download);

        resolve(nativeDirectory);
    });
};

module.exports.getClasses = function (root, version) {
    return new Promise(async (resolve) => {
        const libs = [];

        const libraries = version.libraries.map(async (_lib) => {
            if(!_lib.downloads.artifact) return;

            const libraryPath = _lib.downloads.artifact.path;
            const libraryUrl = _lib.downloads.artifact.url;
            const libraryDirectory = path.join(root, 'libraries', libraryPath);

            if(!fs.existsSync(libraryDirectory)) {
                let directory = libraryDirectory.split('\\');
                const name = directory.pop();
                directory = directory.join('\\');

                await downloadAsync(libraryUrl, directory, name);
            }

            libs.push(libraryDirectory);
        });

        await Promise.all(libraries);

        resolve(libs)
    });
};

module.exports.getLaunchOptions = function (version, options) {
    return new Promise(resolve => {
        let arguments = version.minecraftArguments ? version.minecraftArguments.split(' ') : version.arguments.game;
        const fields = {
            '${auth_access_token}': options.authorization.access_token,
            '${auth_session}': options.authorization.access_token,
            '${auth_player_name}': options.authorization.name,
            '${auth_uuid}': options.authorization.uuid,
            '${user_properties}': options.authorization.user_properties,
            '${user_type}': 'mojang',
            '${version_name}': options.version.number,
            '${assets_index_name}': version.assetIndex.id,
            '${game_directory}': path.join(options.root),
            '${assets_root}': path.join(options.root, 'assets'),
            '${version_type}': options.version.type
        };

        for (let index = 0; index < arguments.length; index++) {
            if (Object.keys(fields).includes(arguments[index])) {
                arguments[index] = fields[arguments[index]];
            }
        }

        resolve(arguments);
    });
};

module.exports.getJVM = function (version, options) {
    return new Promise(resolve => {
        switch(options.os) {
            case "windows": {
                resolve("-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump");
                break;
            }
            case "osx": {
                resolve("-XstartOnFirstThread");
                break;
            }
            case "linux": {
                resolve("-Xss1M");
                break;
            }
        }
    });
};
