// repflow node.js implementation
// a wrapper of the net module

var net = require('net');
var events = require('events');
var stream = require('stream');
var timers = require('timers');
var util = require('util');

var debug = util.debuglog('repnet');

// state names
var ONE_CONN = 0;
var DUP_CONN = 1;
var CHOSEN = 2;
var ENDED = 3;


//******* Constructor of an Queue Item
//****** Parameter: a ONE_CONN repnet.socket object
//*******           (if omitted) set port as undefined
function QItem(socket) {
  if (!(this instanceof QItem)) return new QItem(socket);
  if (typeof socket !== "undefined") {
    this.port = socket.conn1.remotePort;
    this.ip = socket.conn1.remoteAddress;
    this.handle = socket;
    socket.queueItem_handle = this;
  }
  else {
    // if undefined, this item is used in the queue for helping update timing
    this.port = undefined;
  }
};

//****** Function: Try to match new conn in the queue
//****** Parameter: <netsocket> the handle of new net.socket connection
//****** Return Value: if found return the repnet.socket handle; else undefinded
function findItem(self, netsocket) {
  var i = 1;
  while (typeof self.queue[i] !== "undefined") {
    // whether the <port:ip_addr> tuple is matched
    if ( //self.queue[i].port == netsocket.remotePort && 
        self.queue[i].ip == netsocket.remoteAddress) {
      var item = self.queue[i];
      self.queue.splice(i,1);
      return item;
  }
    else i++;
  }
  return undefined;
}


function getconnection(self, conn) {
  item = findItem(self, conn);

  //not matched, emit a new repnet.socket connection
  if (!item) { 
    debug("not matched from port", conn.remotePort);
    s = new Socket();
    s.conn1 = conn;
    s.state = ONE_CONN;

    // Add event listener
    s.conn1.on('data', function(data) {getdata(s, data, true)});
    s.conn1.on('end', function() {getend(s, true)});

    // push into the queue
    self.queue.push(QItem(s));
    debug("Push New Item. Queue length:", self.queue.length);

    // if there is a connection listener as a callback of listen
    if (util.isFunction(self.connectListener)) {
      self.connectListener.call(self, s);
      debug("connectListener called: (local:remote)", conn.localPort, conn.remotePort);
    }
    // if not, emit the "connection" event
    else self.emit('connection', s);
  }

  // matched. then insert new net.socket to the repnet as a conn2
  else {
    s = item.handle;
    s.conn2 = conn;
    s.state = DUP_CONN;
    debug("Matched! Queue length:", self.queue.length, "repnet.socket state", s.state);

    //Add event listeners
    s.conn2.on('data', function(data) {getdata(s, data, false)});
    s.conn2.on('end', function() {getend(s, false)});

    debug("Two port numbers", s.conn1.remotePort, s.conn2.remotePort);
    for (var i = 0; i < s.archive_write.length; i++) {
      conn.write.apply(conn, s.archive_write[i]);
    };
  }
}


function getdata(self, data, index) {
  if (index) { //conn1
    self.readcount[0] += data.length;
    newcount = self.readcount[0] - self.readcount[1];
    if (newcount > 0) {
      newchunk = data.slice(data.length - newcount);
      self.emit('data', newchunk);
    }
    debug("conn1 is reporting ", newcount, "byte(s) of new chunk");
  }
  else { //conn2
    self.readcount[1] += data.length;
    newcount = self.readcount[1] - self.readcount[0];
    if (newcount > 0) {
      newchunk = data.slice(data.length - newcount);
      self.emit('data', newchunk);
    }
    debug("conn2 is reporting ", newcount, "byte(s) of new chunk");
  }
}

function getend(self, index){
  debug('Socket state before ended:', self.state);
  if (index) { // conn1 is ended
    switch (self.state) {
      case ONE_CONN:
        self.state = ENDED;
        self.emit('end');
        break;
      case DUP_CONN:
        self.state = CHOSEN;
        self.conn1 = self.conn2;
        break;
      case CHOSEN:
        self.state = ENDED;
        self.emit('end');
        break;
      default:
        self.emit('error');
        break;
    }
  }
  else { // conn2 is ended
    switch (self.state) {
      case DUP_CONN:
        self.state = CHOSEN;
        self.conn2 = self.conn1;
        break;
      case CHOSEN:
        self.state = ENDED;
        self.emit('end');
        break;
      default:
        self.emit('error');
        break;
    }
  }
}

function Server() {
  if (!(this instanceof Server)) {
    if (arguments.length == 2) return new Server(arguments[0], arguments[1]);
    if (arguments.length == 1) return new Server(arguments[0]);
    if (arguments.length == 0) return new Server();
  }

  events.EventEmitter.call(this);

  // constructor
  var args = [];
  for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
  }
  this.connectListener = args.pop();
  if (!util.isFunction(this.connectListener)) args.push(this.connectListener);
  this.server1 = net.createServer(args);
  this.server2 = net.createServer(args);
  this.queue = [QItem(), QItem(), QItem(), QItem(), QItem()];
  var self = this;

  // update the queue per 1000ms
  setInterval(function(){
    do {
      var trash = self.queue.shift();
      if (trash.port) trash.handle.state = CHOSEN;
    } while(typeof self.queue[0].port !== 'undefined');
    self.queue.push(QItem());
    //debug("Updated Queue Length:", self.queue.length);
  }, 1000);  

  // listen function
  this.listen = function() {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    callback = args.pop();
    if (!util.isFunction(callback)) args.push(callback);
    port = args.shift();
    port2 = port + 1;
    if (args.length > 0) host = args.shift(); else host = 'localhost';
    if (args.length > 0) backlog = args.shift(); else backlog = null;

    var flag_listen = 0;
    self.server1.listen(port, host, backlog, function() {
      flag_listen += 1;
      if (flag_listen == 2) callback.apply(this);
    });
    self.server2.listen(port2, host, backlog, function() {
      flag_listen += 1;
      if (flag_listen == 2) callback.apply(this);
    });
  };

  // got a connection
  this.server1.on('connection', function(s) {
    getconnection(self, s);
  })
  this.server2.on('connection', function(s) {
    getconnection(self, s);
  })
};
util.inherits(Server, events.EventEmitter);
exports.Server = Server;


function Socket() {
  //********** The constructor 
  if (!(this instanceof Socket)) return new Socket(options);
  events.EventEmitter.call(this);
  this.conn1 = undefined;
  this.conn2 = undefined;
  this.state = ENDED;
  this.archive_write = [];
  this.readcount = [0, 0];
  this.queueItem_handle = undefined;
  this.flag_repsyn = false
  
  var self = this;

  //********* Connect Function 
  //********* Accept 1 port arguments
  this.connect = function() {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    var callback = args[args.length-1];
    if (!util.isFunction(callback)) { // don't have a listener
      var flag_connect = false;
      var ifconnect = function() {
        if (!flag_connect) {
          flag_connect = true;
          self.emit('connect');
        }
        else {
          if (self.flag_repsyn) {
            this.end();
            self.state = CHOSEN;
          }
        }
      }
      args.push(ifconnect);
      self.conn1 = new net.Socket();
      self.conn2 = new net.Socket();
      self.conn1.connect.apply(self.conn1, args);
      args[0] += 1;
      self.conn2.connect.apply(self.conn2, args);
      self.state = DUP_CONN;
    }
    else { // callback is the 'connect' listener
      var flag_connect = false;
      var ifconnect = function() {
        if (!flag_connect) {
          flag_connect = true;
          callback.call(self);
        }
      }
      args.push(ifconnect);
      self.state = DUP_CONN;
      self.conn1 = new net.Socket();
      self.conn2 = new net.Socket();
      self.conn1.connect.apply(self.conn1, args);
      args[0] += 1;
      self.conn2.connect.apply(self.conn2, args);
    }

    // each new is followed by the event listeners
    this.conn1.on('data', function(data) {getdata(self, data, true)});
    this.conn2.on('data', function(data) {getdata(self, data, false)});
    this.conn1.on('end', function() {getend(self, true)});
    this.conn2.on('end', function() {getend(self, false)});
  }

  //********** Write Function
  //********** Depend on state
  this.write = function() {
    var data = arguments[0];
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    
    switch (self.state) {
      case ONE_CONN:
        self.conn1.write.apply(self.conn1, args);
        callback = args.pop();
        if (!util.isFunction(callback)) {
          args.push(callback);
        }
        self.archive_write.push(args);
        break;
      case DUP_CONN:
        callback = args.pop();
        if (!util.isFunction(callback)) {
          args.push(callback);
          self.conn1.write.apply(self.conn1, args);
          self.conn2.write.apply(self.conn2, args);
        }
        else {
          var write_status = false;
          var setstatus = function() {
            if (write_status == false) {
              write_status = true;
              callback.apply(self);
            }
          };
          args.push(setstatus);
          self.conn1.write.apply(self.conn1, args);
          self.conn2.write.apply(self.conn2, args);
        }
        break;
      case CHOSEN:
        self.conn1.write.apply(self.conn1, args);
        break;
      default:
        self.emit('error', "ENDED");
        break;
    }
  }

  this.end = function(){
    self.conn1.end.apply(self.conn1, arguments);
    self.conn2.end.apply(self.conn2, arguments);
  }
  
  
};
util.inherits(Socket, events.EventEmitter);
exports.Socket = Socket;

exports.createServer = function() {
  return Server.apply(this, arguments);
};

