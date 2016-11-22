var fs = require('fs'),
    exif = require('./picutil.js'),
    walk = require('walk'),
    path = require('path'),
    util = require('util');

var gallery = {
    /*
     * Directory where the photos are contained
     */
    directory: undefined,

    /*
     * Optional static directory to prefix our directory references with
     * This won't get output in templates - only needed if we've defined a static
     * directory in a framework like express.
     */
    static: undefined,

    /*
     * root URL of the gallery - defaults to root, or '' - NOT '/'
     * an example would be '/gallery', NOT '/gallery/'
     * This has no reflection on where the static assets are stored
     * it's just where our gallery lies in a URL router
     */
    rootURL: '',

    /*
     * Our constructed album JSON lives here
     */
    album: undefined,
    /*
     * Name of our gallery
     */
    name: 'My Gallery',

    /*
     * Image to display when no thumbnail could be located
     */
    noThumbnail: '', // TODO: Bundle a default no thumbnail image?
    /*
     * Filter string to use for excluding filenames. Defaults to a regular expression that excludes dotfiles.
     */
    //ignore _thumb_*
    filter: /^Thumbs.db|^_thumb_*|^\.[a-zA-Z0-9]+/,
    /*
     * Private function to walk a directory and return an array of files
     */
    readFiles: function (params, cb) {
        var files = [],
            directoryPath = this.directory,
            me = this;
        directoryPath = path.resolve(this.static, this.directory);
        console.log("reading directory: " + directoryPath);
        var walker = walk.walk(directoryPath, {
            followLinks: false
        });
        //TODO: 
        walker.on("directories", function (root, dirStatsArray, next) {
            //Can be comment out.
            next();
        });
        walker.on('file', function (root, stat, next) {
            if (stat.name.match(me.filter) != null) {
                return next();
            }
            var file = {
                type: stat.type,
                name: stat.name,
                dir: root.replace(directoryPath, ""),
            };
            files.push(file);
            return next();
        });
        walker.on('end', function () {
            return cb(null, files);
        });
    },
    /*
     * Private function to build an albums object from the files[] array
     */
    buildAlbums: function (files, cb) {
        var albums = {
            name: this.name,
            prettyName: this.name,
            photos: [],
            path: "",
            hash: "",
            isRoot: true,
            albums: []
        },
            dirHash = {};

        for (var i = 0; i < files.length; i++) {
            // Process a single file
            console.log("Building File : " + files[i].dir + path.sep + files[i].name);
            var file = files[i],
                dirs = file.dir.split(path.sep),
                dirHashKey = "",
                pAlbum = albums,
                curAlbum = albums; // reset current album to root at each new file

            var curDir = dirs.slice(-1)[0];
            var pdirHashKey = dirs.slice(0, dirs.length - 1);
            pdirHashKey = pdirHashKey.join("");
            dirHashKey = dirs.join("");
            pAlbum = searchAlbum(albums, pdirHashKey);
            if (!pAlbum) pAlbum = albums;
            if (curDir == "") {
                //Root Directory, beacomes the TOP level album. 
                curDir = "/";
                dirHash[""] = "";
            };

            if (!dirHash.hasOwnProperty(dirHashKey)) {
                console.log("coming to create dir hash " + dirHashKey);
                // If we've never seen this album before, let's create it
                var currentAlbumPath = dirs.join(path.sep);
                dirHash[dirHashKey] = true // TODO - consider binding the album to this hash, and even REDIS-ing..

                var newAlbum = {
                    name: curDir,
                    prettyName: decodeURIComponent(curDir),
                    description: "",
                    hash: dirHashKey,
                    path: currentAlbumPath,
                    photos: [],
                    albums: []
                };

                pAlbum.albums.push(newAlbum);
                curAlbum = newAlbum;
            } else {
                // we've seen this album, we need to drill into it
                // search for the right album & update curAlbum
                var curAls = pAlbum.albums;
                for (var k = 0; k < curAls.length; k++) {
                    var al = curAls[k];
                    if (al.hash === dirHashKey) {
                        curAlbum = al;
                        break;
                    }
                }
            }
            var fullpath = path.join(this.static, this.directory, file.dir, file.name);
            if (file.name == "info.json") {

                var info = fs.readFileSync(fullpath);
                try {
                    info = JSON.parse(info);
                } catch (e) {
                    // If invalid JSON, just bail..
                    continue;
                }
                curAlbum.description = info.description || null;
                curAlbum.prettyName = info.name || curAlbum.prettyName;

                if (info.thumb || info.thumbnail) {
                    var thumbnailImage = info.thumb || info.thumbnail;
                    thumbnailImage = curAlbum.path + "/" + thumbnailImage;
                    curAlbum.thumb = thumbnailImage;
                }

            } else {
                //remove ext
                var photoName = file.name.replace(/.[^\.]+$/, "");

                var photo = {
                    name: photoName,
                    //path: fullpath.replace(this.directory,"").replace(this.static,"") 
                    path: path.join(file.dir, file.name)
                };
                // sample: 
                //       { name: '390_G', path: 'Ireland/West Coast/390_G.jpg' }
                var myself = this;

                // we have a photo object - let's try get it's exif data. We've
                // already pushed into curAlbum, no rush getting exif now!
                // Create a closure to give us scope to photo
                (function (photo, curAlbum) {
                    var fullPath = path.join(myself.static, myself.directory, photo.path);
                    exif.exif(fullPath, photo, function (err, exifPhoto) {
                        // no need to do anything with our result - we've altered
                        // the photo object..
                        //console.log(exifPhoto);
                    });
                    exif.imConvert(fullPath, photo, function (err, out) {
                        var photopath = photo.path;
                        photo.thumb = path.dirname(photopath) + path.sep + path.basename(photo.thumb);
                        //console.log(out);
                    });
                })(photo, curAlbum);
                curAlbum.photos.push(photo);
            }
        }
        //console.log(JSON.stringify(pAlbum,null,2));
        //console.log(JSON.stringify(albums,null,2));


        // Function to iterate over our completed albums, calling _buildThumbnails on each

        function _recurseOverAlbums(al) {

            if (!al.thumb) {
                al.thumb = _buildThumbnails(al); // only set this album's thumbanil if not already done in info.json
            }

            if (al.albums.length > 0) {
                for (var i = 0; i < al.albums.length; i++) {
                    _recurseOverAlbums(al.albums[i]);
                }
            }
        }

        var me = this;

        function _buildThumbnails(album) {
            var photoChildren = album.photos,
                albumChildren = album.albums;

            if (photoChildren.length && photoChildren.length > 0) {
                var albumThumb = photoChildren[0].path;
                return albumThumb;
            } else {
                if (albumChildren.length && albumChildren.length > 1) {
                    return _buildThumbnails(albumChildren[0]);
                } else {
                    // TODO: No image could be found
                    return me.noThumbnail;
                }
            }
        }

        _recurseOverAlbums(albums);

        return cb(null, albums);
    },
    /*
     * Public API to node-gallery, currently just returns JSON block
     */
    init: function (params, cb) {
        var me = this,
            directory = params.directory;
        if (!cb || typeof cb !== "function") {
            cb = function (err) {
                if (err) {
                    throw new Error(err.toString());
                }
            };
        }

        if (!directory) throw new Error('`directory` is a required parameter');

        // Massage our static directory and directory params into our expected format
        // might be easier by regex..
        console.log("directory " + directory);
        this.rootURL = params.rootURL;
        this.directory = directory;
        this.static = params.static;
        console.log("static" + this.static);
        this.name = params.name || this.name;
        this.filter = params.filter || this.filter;

        this.readFiles(null, function (err, files) {
            if (err) {
                console.log("ERR" + err);
                return cb(err);
            }
            me.buildAlbums(files, function (err, album) {
                me.album = album;
                return cb(err, album);
            })
        });
    },
    /*
     * Returns a photo. Usage:
     * getPhoto({ photo: 'test.jpg', album: 'Ireland'}, function(err, photo){
     *   console.log(photo.path);
     * );
     */
    getPhoto: function (params, cb) {
        // bind the album name to the request
        var photoName = params.photo.replace(/.[^\.]+$/, ""), // strip the extension
            albumPath = params.album;
        this.getAlbum(params, function (err, data) {
            if (err) {
                return cb(err);
            };

            var album = data.album;
            var photos = album.photos;
            for (var i = 0; i < photos.length; i++) {
                var photo = photos[i];
                if (photo.name === photoName) {

                    return gallery.afterGettingItem(null, {
                        type: 'photo',
                        photo: photo
                    }, cb);
                }
            }

            return cb('Failed to load photo ' + photoName + ' in album ' + albumPath, null);
        });
    },
    /*
     * Function to return a specific album. Usage:
     * gallery.getAlbum({ album: 'Ireland/Waterford', function(err, album){
     *   console.log(album.path);
     * });
     */
    getAlbum: function (params, cb) {
        var album = this.album,
            albumPath = params.album;
        console.log("album " + albumPath);
        //console.log(JSON.stringify(album,null,2));

        if (!albumPath || albumPath == '') {
            //return cb(null, album);
            return this.afterGettingItem(null, {
                type: 'album',
                album: album
            }, cb);
        }
        var dirs = albumPath.split(path.sep);
        for (var i = 0; i < dirs.length; i++) {
            var dir = dirs[i];
            var aChildren = album.albums;
            for (var j = 0; j < aChildren.length; j++) {
                var aChild = aChildren[j];
                if (aChild.name === dir) {
                    album = aChild;
                }
            }
        }

        if (album.hash !== dirs.join("")) {
            console.log(dirs.join(""));
            return cb('Failed to load album ' + albumPath, null);
        }
        return this.afterGettingItem(null, {
            type: 'album',
            album: album
        }, cb);

    },
    /*
     * Private function which massages the return type into something useful to a website.
     * Builds stuff like a breadcrumb, back URL..
     */
    afterGettingItem: function (err, data, cb) {
        var item = data[data.type];
        var breadcrumb = item.path.split("/");
        var back = data.back = breadcrumb.slice(0, item.path.split("/").length - 1).join("/"); // figure out up a level's URL

        // Construct the breadcrumb better.
        data.breadcrumb = [];
        var breadSoFar = "" + this.rootURL + "";
        // Add a root level to the breadcrumb
        data.breadcrumb.push({
            name: this.name,
            url: this.rootURL
        });
        for (var i = 0; i < breadcrumb.length; i++) {
            var b = breadcrumb[i];
            if (b == "") {
                continue;
            }
            breadSoFar += "/" + breadcrumb[i];

            data.breadcrumb.push({
                name: b,
                url: breadSoFar
            });
        }

        data.name = this.name;
        data.directory = this.directory;
        data.rootDir = this.rootURL;

        return cb(err, data);
    },
    middleware: function (options) {
        var me = this;
        this.init(options);
        return function (req, res, next) {
            var url = req.url,
                rootURL = gallery.rootURL,
                params = req.params,
                requestParams = {},
                image = false;
            var staticTest = /\.png|\.jpg|\.css|\.js/i;
            if (rootURL == "" || url.indexOf(rootURL) === -1 /*|| staticTest.test(url)*/) {
                return next();
            }

            url = url.replace(rootURL, "");
            // Do some URL massaging - wouldn't have to do this if .params were accessible?
            if (url.charAt(0) === "/") {
                url = url.substring(1, url.length);
            }
            url = decodeURIComponent(url);

            if (url && url !== "") {
                var path = url.trim(),
                    isFile = /\b.(jpg|bmp|jpeg|gif|png|tif)\b$/;
                image = isFile.test(path.toLowerCase());
                path = path.split("/");
                if (image) { // If we detect image file name at end, get filename
                    image = path.pop();
                }
                path = path.join("/").trim();

                requestParams = {
                    album: path,
                    photo: image
                };

            }
            var getterFunction = (image) ? gallery.getPhoto : gallery.getAlbum;

            getterFunction.apply(gallery, [requestParams,
                function (err, data) {
                    req.gallery = data;
                    return next(err);
                    //Should we do this here? res.render(data.type + '.ejs', data);
                }
            ]);
        }
    }
};

function searchAlbum(alb, hash) {
    if (alb.hash == hash) return alb;
    var als = alb.albums;
    var node = undefined;
    for (var i = 0; i < als.length; i++) {
        node = searchAlbum(als[i], hash);
        if (node) {
            return node;
        }
    }
    return null;
};

module.exports = gallery;