var app = require('http').createServer(handler);
var io = require('socket.io')(app);
var fs = require('fs');

var clients = {};

var cryptoJS = require('crypto-js');
var crypto = require('crypto');

var mysql = require('mysql');
var pool  = mysql.createPool({
  connectionLimit : 10,
  host            : 'localhost',
  user            : 'root',
  password        : 'root',
  database        : 'si3'
});



//servers
var t_server = require("socket.io-client")('http://localhost:3001');
var service_server = require("socket.io-client")('http://localhost:3002');




app.listen(3000);

function handler (req, res) {
  fs.readFile(__dirname + '/index.html',
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
    }

    res.writeHead(200);
    res.end(data);
  });
}

io.on('connection', function (socket) {

  clients[socket.id] = {};

  socket.on('access_request', function (data) {
      
    console.log(socket.id);

    var token = crypto.randomBytes(16).toString('hex');

    //generate session id or use socket.id
    clients[socket.id].token = token;
    clients[socket.id].user = data.user;
    clients[socket.id].service = data.service;
    //store socket
    clients[socket.id].socket = socket;

    pool.getConnection(function(err, connection) {      
      // Use the connection
      connection.query('SELECT userAccess, userKey FROM users WHERE userName = \'' + data.user + '\'', function(err, rows) {
        if (err) throw err;
        //user stuff
        if(rows[0]) {
          clients[socket.id].userAccess = rows[0].userAccess;
          clients[socket.id].userKey = rows[0].userKey;

          console.log('Sending U to T');

          t_server.emit('process_request', { token: clients[socket.id].token, user: clients[socket.id].user, service: clients[socket.id].service, sid: socket.id });
        } else {
          sendError(clients[socket.id], 'User not found!');
        }
        connection.release();
      });
    });
  
  });

  //from T server
  socket.on('handshake', function(data) {
    if(!data.success) {
      clients[data.sid].socket.emit('not_found', { entity: data.entity });
    } else {
      console.log('Handshake success!');
      //something
      var sid = data.sid;
      var token = data.token;
      var k = data.k;
      var life = data.life;
      var service = data.service;
      //console.log(data);

      if(clients[sid]) {
        //decrypt and verify
        var decToken = cryptoJS.TripleDES.decrypt(token, clients[sid].userKey).toString(cryptoJS.enc.Latin1);
        var decLife = cryptoJS.TripleDES.decrypt(life, clients[sid].userKey).toString(cryptoJS.enc.Latin1);
        var decK =  cryptoJS.TripleDES.decrypt(k, clients[sid].userKey).toString(cryptoJS.enc.Latin1);
        var decService =  cryptoJS.TripleDES.decrypt(service, clients[sid].userKey).toString(cryptoJS.enc.Latin1);
        
        console.log(decToken + ' '  + decK + ' ' + decService);
        //check if this is what I requested
        if(clients[sid].token == decToken && decService == clients[sid].service) {
          
          var timestamp = Math.floor(new Date() / 1000);
          timestamp = cryptoJS.TripleDES.encrypt(String(timestamp), decK).toString();
          var user = cryptoJS.TripleDES.encrypt(clients[sid].user, decK).toString();
          decLife = cryptoJS.TripleDES.encrypt(decLife, decK).toString();

          //send to S K2U2L2
          service_server.emit('service',{ k1: data.k2, user1: data.u2, life1: data.l2, timestamp: timestamp, user2: user, life2: decLife, sid: sid, service: decService });  
        } else {
          sendError(clients[sid], 'Values are not similar to the one we sent!');
        }
      } else {
        //fail
        sendError(clients[sid], 'User message not found!');
      }
    }
    
  });

  socket.on('handshake_2', function(data) {
    if(!data.success) {
      sendError(clients[data.sid], data.message);
    } else {
      console.log('Handshake2: success');
      var message = 'User can now access the service';
      clients[data.sid].socket.emit('success', { msg: message});
    }
  });

  socket.on('register_user', function(data) {
    var key = crypto.randomBytes(12).toString('hex');
    key = key.toString('base64');

    pool.getConnection(function(err, connection) {
      // Use the connection
      connection.query('INSERT INTO users (userName, userAccess, userKey) VALUES (\'' + data.userName + '\',\'' + data.userAccess + '\', \'' + key + '\')', function(err, result) {
        if (err) socket.emit('alert_error', {msg: 'Duplicate name please user another one' });
        else {
          socket.emit('success', {msg: 'User created!' });
        }
        connection.release();
      });
    });
  });

    //on dc remove client
  socket.on('disconnect', function() {
    delete clients[socket.id];
  });

});

function sendError(client, message) {
  console.log('Error: ' + message);
  client.socket.emit('alert_error', { msg: message });  

}