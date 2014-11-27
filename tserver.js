var io = require('socket.io')(3001);

var user_server = require("socket.io-client")('http://localhost:3000');
var service_server = require("socket.io-client")('http://localhost:3002');

var crypto = require('crypto');
var cryptoJS = require('crypto-js');
// note, io.listen(&lt;port&gt;) will create a http server for you

var mysql = require('mysql');
var pool  = mysql.createPool({
  connectionLimit : 10,
  host            : 'localhost',
  user            : 'root',
  password        : 'root',
  database        : 'si3'
});


function sendError(value, sid) {
  user_server.emit('handshake', { success: false, sid: sid, entity: value});
}
function sendHandshake(token, kut, user, kst, service, sid) {


  //generate K
  generatedK = crypto.randomBytes(16).toString('hex');

  console.log('Generated K: ' + generatedK);
  //k lifetime
  var life = 60;//seconds
  console.log(kut);

  var encK = cryptoJS.TripleDES.encrypt(String(generatedK), kut);
  var encT = cryptoJS.TripleDES.encrypt(token, kut);
  var encL = cryptoJS.TripleDES.encrypt(String(life), kut);
  var encS = cryptoJS.TripleDES.encrypt(service, kut);


  var encK2 = cryptoJS.TripleDES.encrypt(String(generatedK), kst).toString();
  var encL2 = cryptoJS.TripleDES.encrypt(String(life), kst).toString();
  var encU = cryptoJS.TripleDES.encrypt(String(user), kst).toString();

  //token enc
  user_server.emit('handshake', { success: true, token: encT.toString(), k: encK.toString(), life: encL.toString(), service: encS.toString(), k2: encK2, l2: encL2, u2: encU, sid: sid });
  

}

io.on('connection', function (socket) {

  //io.emit('this', { will: 'be received by everyone'});

  socket.on('process_request', function (data) {
    console.log('T server connection from:' +  data.token + ' - ' + data.user + ' - ' + data.service);
    var kut, kst, serviceAccess, userAccess; 

    //mysql pool
    pool.getConnection(function(err, connection) {
      // Use the connection
      connection.query('SELECT userAccess, userKey FROM users WHERE userName = \'' + data.user + '\'', function(err, rows) {
        if (err) throw err;
        //user stuff
        if(rows[0]) {
          userAccess = rows[0].userAccess;
          kut = rows[0].userKey;

          connection.query('SELECT serviceAccess, serviceKey FROM services WHERE serviceName = ' + data.service, function(err, rows) {
            if (err) throw err;

            // And done with the connection.
            // Don't use the connection here, it has been returned to the pool.
            if(rows[0]) {
              //Verify IF USER HAS RIGHTS FOR SERVICE BELL LAPADULA
              serviceAccess = rows[0].serviceAccess;
              kst = rows[0].serviceKey;
              //check access
              var rights;
              if(userAccess > serviceAccess) {
                rights = 'read';
              } else if(userAccess < serviceAccess) {
                rights = 'write'; 
              } else {
                rights = 'read & write';
              }
              console.log('Rights: ' + rights);
              sendHandshake(data.token, kut, data.user, kst, data.service, data.sid);
              connection.release();
            } else {
              //show error
              connection.release();
              sendError('service', data.sid);
            }
          });
        } else {
          //show error
          connection.release();
          sendError('user', data.sid);
        }
      });
    });

  });

  socket.on('disconnect', function () {
    io.sockets.emit('user disconnected');
  });
});
