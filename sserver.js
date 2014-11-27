var app = require('http').createServer(handler)
var io = require('socket.io')(app);

var user_server = require("socket.io-client")('http://localhost:3000');

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

app.listen(3002);

function handler (req, res) {
    res.writeHead(200);
    res.end('Service server');
}

io.sockets.on("connection",function(socket){
    
    socket.on("service", function(data) {
        //kst
        var k = data.k1;
        var user1 = data.user1;
        var life1 = data.life1;

        //k
        var timestamp = data.timestamp;
        var user2 = data.user2;
        var life2 = data.life2;

        
        pool.getConnection(function(err, connection) {
            // Use the connection
            connection.query('SELECT serviceKey FROM services WHERE serviceName = \'' + data.service + '\'', function(err, rows) {
                if (err) throw err;
                if(rows[0]) {
                    var kst = rows[0].serviceKey;
                    k =  cryptoJS.TripleDES.decrypt(k, kst).toString(cryptoJS.enc.Latin1);
                    user1 = cryptoJS.TripleDES.decrypt(user1, kst).toString(cryptoJS.enc.Latin1);
                    life1 = cryptoJS.TripleDES.decrypt(life1, kst).toString(cryptoJS.enc.Latin1);
                    
                    //decrypt with k
                    timestamp = cryptoJS.TripleDES.decrypt(timestamp, k).toString(cryptoJS.enc.Latin1);
                    user2 = cryptoJS.TripleDES.decrypt(user2, k).toString(cryptoJS.enc.Latin1);
                    life2 = cryptoJS.TripleDES.decrypt(life2, k).toString(cryptoJS.enc.Latin1);

                    currentTimestamp = Math.floor(new Date() / 1000);


/*                        console.log('current: ' + currentTimestamp);
                    console.log('received: ' + timestamp);
                    console.log('life: ' + life1);
                    console.log(timestamp + ' - ' + currentTimestamp + ' - ' + life2);                     
*/
                    if(currentTimestamp - timestamp <= (life1 / 1000) && user1 == user2) {
                        //send success message
                        user_server.emit('handshake_2', { success: true, timestamp: timestamp, lifetime: life1, sid: data.sid });
                    } else {
                        var message = 'Session expired!';
                        if(user1 != user2) {
                            message = 'Users dont match!';
                        }
                        user_server.emit('handshake_2', { success: false, message: message, sid: data.sid });
                    }
                }
                connection.release();
            });
        });
    });


    socket.on('register_service', function(data) {
        var key = crypto.randomBytes(12).toString('hex');
        key = key.toString('base64');
        console.log(data);
        pool.getConnection(function(err, connection) {
          // Use the connection
          connection.query('INSERT INTO services (serviceName, serviceAccess, serviceKey) VALUES (\'' + data.serviceName + '\',\'' + data.serviceAccess + '\', \'' + key + '\')', function(err, result) {
            if (err) socket.emit('service_alert', {msg: 'Duplicate ervice name please user another one' });
            else {
              console.log('service created!');
              socket.emit('service_alert', {msg: 'Service created!' });
            }
            connection.release();
          });
        });
    });

});
