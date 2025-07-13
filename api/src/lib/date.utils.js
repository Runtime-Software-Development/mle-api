/*!
 * MLP.API.Utilities.Date
 * File: /lib/date.utils.js
 * Copyright(c) 2021 Runtime Software Development Inc.
 * MIT Licensed
 */

// Initialization
'use strict';

// Date formatter
// REFERENCE: https://stackoverflow.com/a/14638191
function formatDate(date, format, utc) {
  if (!date || !format) return;

  const MMMM = [
    '\x00',
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const MMM = ['\x01', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dddd = ['\x02', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ddd = ['\x03', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function ii(i, len) {
    var s = i + '';
    len = len || 2;
    while (s.length < len) s = '0' + s;
    return s;
  }

  var y = utc ? date.getUTCFullYear() : date.getFullYear();
  format = format.replace(/(^|[^\\])yyyy+/g, '$1' + y);
  format = format.replace(/(^|[^\\])yy/g, '$1' + y.toString().substr(2, 2));
  format = format.replace(/(^|[^\\])y/g, '$1' + y);

  var M = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
  format = format.replace(/(^|[^\\])MMMM+/g, '$1' + MMMM[0]);
  format = format.replace(/(^|[^\\])MMM/g, '$1' + MMM[0]);
  format = format.replace(/(^|[^\\])MM/g, '$1' + ii(M));
  format = format.replace(/(^|[^\\])M/g, '$1' + M);

  var d = utc ? date.getUTCDate() : date.getDate();
  format = format.replace(/(^|[^\\])dddd+/g, '$1' + dddd[0]);
  format = format.replace(/(^|[^\\])ddd/g, '$1' + ddd[0]);
  format = format.replace(/(^|[^\\])dd/g, '$1' + ii(d));
  format = format.replace(/(^|[^\\])d/g, '$1' + d);

  var H = utc ? date.getUTCHours() : date.getHours();
  format = format.replace(/(^|[^\\])HH+/g, '$1' + ii(H));
  format = format.replace(/(^|[^\\])H/g, '$1' + H);

  var h = H > 12 ? H - 12 : H == 0 ? 12 : H;
  format = format.replace(/(^|[^\\])hh+/g, '$1' + ii(h));
  format = format.replace(/(^|[^\\])h/g, '$1' + h);

  var m = utc ? date.getUTCMinutes() : date.getMinutes();
  format = format.replace(/(^|[^\\])mm+/g, '$1' + ii(m));
  format = format.replace(/(^|[^\\])m/g, '$1' + m);

  var s = utc ? date.getUTCSeconds() : date.getSeconds();
  format = format.replace(/(^|[^\\])ss+/g, '$1' + ii(s));
  format = format.replace(/(^|[^\\])s/g, '$1' + s);

  var f = utc ? date.getUTCMilliseconds() : date.getMilliseconds();
  format = format.replace(/(^|[^\\])fff+/g, '$1' + ii(f, 3));
  f = Math.round(f / 10);
  format = format.replace(/(^|[^\\])ff/g, '$1' + ii(f));
  f = Math.round(f / 10);
  format = format.replace(/(^|[^\\])f/g, '$1' + f);

  var T = H < 12 ? 'AM' : 'PM';
  format = format.replace(/(^|[^\\])TT+/g, '$1' + T);
  format = format.replace(/(^|[^\\])T/g, '$1' + T.charAt(0));

  var t = T.toLowerCase();
  format = format.replace(/(^|[^\\])tt+/g, '$1' + t);
  format = format.replace(/(^|[^\\])t/g, '$1' + t.charAt(0));

  var tz = -date.getTimezoneOffset();
  var K = utc || !tz ? 'Z' : tz > 0 ? '+' : '-';
  if (!utc) {
    tz = Math.abs(tz);
    var tzHrs = Math.floor(tz / 60);
    var tzMin = tz % 60;
    K += ii(tzHrs) + ':' + ii(tzMin);
  }
  format = format.replace(/(^|[^\\])K/g, '$1' + K);

  var day = (utc ? date.getUTCDay() : date.getDay()) + 1;
  format = format.replace(new RegExp(dddd[0], 'g'), dddd[day]);
  format = format.replace(new RegExp(ddd[0], 'g'), ddd[day]);

  format = format.replace(new RegExp(MMMM[0], 'g'), MMMM[M]);
  format = format.replace(new RegExp(MMM[0], 'g'), MMM[M]);

  format = format.replace(/\\(.)/g, '$1');

  return format;
}

// export date formatter
exports.formatDate = (date, format, utc) => {
  return formatDate(date.toString(), format, utc);
};

// export converted date
exports.convert = (dateStr) => {
  return new Date(dateStr);
};

/**
 * Reformat data according to datatype in schema
 *
 * @param {Object} data
 * @param {Object} schema
 * @src public
 */

export function reformat(data, schema) {
    data.forEach((item) => {
        for (const [key, field] of Object.entries(item)) {
            if (!field) continue;
            const dataType = schema.attributes.hasOwnProperty(key) ? schema.attributes[key].type : null;
            switch (dataType) {
                case 'timestamp':
                    //"yyyy-MM-dd hh:mm:ss"
                    item[key] = date.convert(field).toLocaleString();
                    break;
            }
        }
    });
    return data;
}

// export today's date
exports.now = new Date();
