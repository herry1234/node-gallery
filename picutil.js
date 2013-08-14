var im = require('imagemagick'); 
var path = require('path'),fs = require('fs');

/*
 * Utility function to convert exif data into something a bit more consumable
 * by a template
 */
exports.exif = function(staticPath, photo, callback){
   // We don't care about errors in here - we can always return an undefined exif
   photo.exif = undefined;
   try {
      im.readMetadata(staticPath, function(err, metadata){
         //console.log(staticPath);
         if (err) {
            console.log('[exif.js] error in ' + staticPath + ': ' + JSON.stringify(err));
            photo.exif = false;
            return callback(null, photo);
         }else {
            //console.log('Shot at '+metadata.exif.dateTimeOriginal);
            //console.log(metadata.exif);
            var myexif = metadata.exif;
            var exifMap = {};
            exifMap["Make"] = (myexif.make) ? myexif.make:undefined;
            exifMap["Model"] = myexif.model ? myexif.model: undefined;
            exifMap.Time = myexif.dateTimeOriginal ? myexif.dateTimeOriginal: undefined;
            //exifMap["Time"] = myexif.dateTime;
            exifMap["aperture"] = myexif.fNumber ? myexif.fNumber : undefined;
            exifMap["focalLength"] = myexif.focalLength ?myexif.focalLength:undefined;
            exifMap["ISO"] = myexif.isoSpeedRatings? myexif.isoSpeedRatings:undefined;
            //exifMap["Shutter Speed"] = dec2frac(myexif.exposureTime);
            exifMap["Shutter Speed"] = myexif.exposureTime?myexif.exposureTime:undefined;
            exifMap["Lat"] = myexif.gpsInfo? myexif.gpsInfo:undefined;
            photo.exif = exifMap;
            //console.log(photo.exif);
            return callback(null, photo);
         }
      });
   } catch (error) {
      return callback(null, photo);
   }
}

exports.imConvert =  function(staticPath, photo, callback){
   try {
      var thumbname =  path.dirname(staticPath) + path.sep + '_thumb_' + path.basename(staticPath);
      console.log(thumbname);
      photo.thumb = path.basename(thumbname);
      if(fs.existsSync(thumbname)) return callback(null,photo);
      console.log("GENERATING thumb files ...");
      im.convert([staticPath, '-resize', '400x300', thumbname], function(err, stdout){
         console.log(staticPath);
         if (err) {
            console.log('[picutil.js] error in ' + staticPath + ': ' + stdout);
            return callback(null, photo);
         }else {
            return callback(null, photo);
         }
      });
   } catch (error) {
      return callback(null, photo);
   }
}
//module.exports = exif;
//module.exports = imConvert;
