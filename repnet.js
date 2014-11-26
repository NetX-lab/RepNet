// repflow node.js implementation
// a wrapper of the net module

var net = require('net');
var events = require('events');
var stream = require('stream');
var timers = require('timers');
var util = require('util');

// Usage: run with NODE_DEBUG=repnet node XXXX.js
var debug = util.debuglog('repnet');

// repsocket state names
var ONE_CONN = 0;
var DUP_CONN = 1;
var CHOSEN = 2;
var ENDED = 3;

// local port range
var LOCAL_PORT_LOW = 32768;
var LOCAL_PORT_HIGH = 61000;

// Flag to enable RepSYN instead of RepFlow.
// Usage: net.flag_repsyn = true
var flag_repsyn = false;

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
    if ( self.queue[i].port == netsocket.remotePort && 
        self.queue[i].ip == netsocket.remoteAddress) {
      var item = self.queue[i];
      self.queue.splice(i,1);
      return item;
  }
    else i++;
  }
  return undefined;
}

//****** Function: The callback of 'connect' evemt (in a net.socket object)
//****** Parameter: <conn> the handle of new net.socket connection, emited by 'connect' event
//****** Process: 1. search the item in the waiting list;
//******          2. new a repnet.socket or insert this new conn as the second member of an existing repnet.socket
function getconnection(self, conn) {
  item = findItem(self, conn);

  //not matched, emit a new repnet.socket connection
  if (!item) { 
    debug("not matched from port", conn.remotePort);
    s = new Socket();
    s.conn1 = conn;
    s.state = ONE_CONN;

    // Add event listener
    s.conn1.on('data', function(data) {getdata(s, data, true);});
    s.conn1.on('end', function() {getend(s, true);});
    s.conn1.on('error', function() {
      if (s.state == ONE_CONN || s.state == CHOSEN) s.emit('error');
      getend(s, true);
    })

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

    //Add appropriate event listeners
    s.conn2.on('data', function(data) {getdata(s, data, false);});
    s.conn2.on('end', function() {getend(s, false);});
    s.conn1.on('error', function() {
      if (s.state == ONE_CONN || s.state == CHOSEN) s.emit('error');
      getend(s, true);
    })
    s.conn2.on('error', function() {getend(s, false);});

    debug("Two port numbers", s.conn1.remotePort, s.conn2.remotePort);
    //execute the archived commands on the slower conn
    for (var i = 0; i < s.archive_write.length; i++) {
      conn.write.apply(conn, s.archive_write[i]);
    };
  }
}

//****** Function: The callback of 'data' evemt (in a net.socket object)
//****** Parameter: <data> newly emitted data
//******            <index> to differentiate which conn has got data. true for conn1, false for conn2.
//****** Process: check the data count. 
//****** if the new chunk is detected, it will be emited along with the 'data' event in a net.repsockt object.
function getdata(self, data, index) {
  if (index) { 
    // if conn1 gets new data
    self.readcount[0] += data.length;
    newcount = self.readcount[0] - self.readcount[1];
    if (newcount > 0) {
      debug("conn1 is reporting ", newcount, "byte(s) of new chunk");
      newchunk = data.slice(data.length - newcount);
      self.emit('data', newchunk);
    }
  }
  else { 
    // if conn2 gets new data
    self.readcount[1] += data.length;
    newcount = self.readcount[1] - self.readcount[0];
    if (newcount > 0) {
      debug("conn2 is reporting ", newcount, "byte(s) of new chunk");
      newchunk = data.slice(data.length - newcount);
      self.emit('data', newchunk);
    }
  }
}

//****** Function: The callback of 'end' evemt (in a net.socket object)
//****** Parameter: <index> to differentiate which conn has got data. true for conn1, false for conn2.
//****** Process: check the state of current net.repsocket object. 
//******          do decisions based on which sub-socket is going to be ended
function getend(self, index){
  debug("state before ened, index", self.state, index);
  if (index) { // conn1 is ended
    switch (self.state) {
      case ONE_CONN: // ending the only connection
        self.state = ENDED;
        self.emit('end');
        break;
      case DUP_CONN: // ending one of the two connections, convert to CHOSEN
        self.state = CHOSEN;
        // in chosen mode, the working socket is always conn1
        self.conn1 = self.conn2;
        self.conn2 = undefined;
        break;
      case CHOSEN: // ending the only connection
        self.state = ENDED;
        self.emit('end');
        break;
      default:
        break;
    }
  }
  else { // conn2 is ended
    switch (self.state) {
      case DUP_CONN: // convert to CHOSEN
        self.state = CHOSEN;
        self.conn2 = undefined;
        break;
      case CHOSEN: // ending the only connection
        self.state = ENDED;
        self.emit('end');
        break;
      default: // in CHOSEN state, conn2 is always unvalid
        break;
    }
  }
}


//****** The repnet.server class
function Server() {
  // Adapt to parameter variations, become a constructor
  if (!(this instanceof Server)) {
    if (arguments.length == 2) return new Server(arguments[0], arguments[1]);
    if (arguments.length == 1) return new Server(arguments[0]);
    if (arguments.length === 0) return new Server();
  }

  events.EventEmitter.call(this);

  // member variables
  var args = [];
  for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
  }
  this.connectListener = args.pop();
  if (!util.isFunction(this.connectListener)) args.push(this.connectListener);
  this.server1 = net.createServer(args);
  this.server2 = net.createServer(args);
  this.queue = [QItem(), QItem(), QItem(), QItem(), QItem()];
  var self = this; // use self to pass server handle to the member functions

  // update the queue per 200ms
  setInterval(function(){
    do {
      var trash = self.queue.shift();
      if (trash.port) trash.handle.state = CHOSEN;
    } while(typeof self.queue[0].port !== 'undefined');
    self.queue.push(QItem());
    //debug("Updated Queue Length:", self.queue.length);
  }, 200);  

  // listen function
  this.listen = function() {
    // normalize parameters
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    callback = args.pop();
    // if there is no callback function, the last parameter should be pushed back
    if (!util.isFunction(callback)) args.push(callback);
    // two port numbers
    port = args.shift();
    port2 = port + 1;
    if (args.length > 0) host = args.shift(); else host = 'localhost';
    if (args.length > 0) backlog = args.shift(); else backlog = null;

    var flag_listen = 0; // flag to make sure when to call the callback function
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
// exports as an API
exports.Server = Server;

//****** The repnet.socket class
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
  
  var self = this; // use self to pass server handle to the member functions

  //********* Connect Function 
  //********* Accept 1 port arguments
  this.connect = function() {
    // Start Connection --> Start timer
    var starttime = process.hrtime();
    var endtime;

    if (!flag_repsyn) { // not a repsyn conn
      var args = [];
      for (var i = 0; i < arguments.length; i++) {
          args.push(arguments[i]);
      }
      var callback = args[args.length-1];
      if (!util.isFunction(callback)) { // don't have a listener
        var flag_connect = false;
        var ifconnect = function() {
          if (!flag_connect) {
            endtime = process.hrtime(starttime);
            endtime = endtime[1]/1000000 + endtime[0] * 1000;
            // endtime is the probe RTT in ms
            if (endtime > 1) {
              flag_repsyn = true;
            }
            else {
              flag_repsyn = false;
            }
            
            flag_connect = true;
            self.emit('connect');
          }
          else {
            if (flag_repsyn) {
              this.end();
              self.state = CHOSEN;
            }
          }
        }
        args.push(ifconnect);
        // Generate a random port number
        var localport = Math.floor(Math.random() * (LOCAL_PORT_HIGH - LOCAL_PORT_LOW)) + LOCAL_PORT_LOW;
        console.log("Random Port:", localport);
        // bind to the same local port, using a little trick.
        self.state = DUP_CONN;
        self.conn1 = new net.Socket({ handle: net._createServerHandle('127.0.0.1', localport, 4)});
        self.conn2 = new net.Socket({ handle: net._createServerHandle('127.0.0.1', localport, 4)});
        // connect!
        self.conn1.connect.apply(self.conn1, args);
        args[0] += 1;
        self.conn2.connect.apply(self.conn2, args);
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
        // Generate a random port number
        var localport = Math.floor(Math.random() * (LOCAL_PORT_HIGH - LOCAL_PORT_LOW)) + LOCAL_PORT_LOW;
        debug("Random Port:", localport);
        // bind to the same local port, using a little trick.
        self.conn1 = new net.Socket({ handle: net._createServerHandle('127.0.0.1', localport, 4)});
        self.conn2 = new net.Socket({ handle: net._createServerHandle('127.0.0.1', localport, 4)});
        // connect!
        self.conn1.connect.apply(self.conn1, args);
        args[0] += 1;
        self.conn2.connect.apply(self.conn2, args);
      }

      // register the event listeners
      this.conn1.on('data', function(data) {getdata(self, data, true);});
      this.conn2.on('data', function(data) {getdata(self, data, false);});
      this.conn1.on('end', function() {getend(self, true);});
      this.conn2.on('end', function() {getend(self, false);});
      this.conn1.on('error', function() {
        if (this.state == ONE_CONN || this.state == CHOSEN) this.emit('error');
        getend(this, true);
      })
      this.conn2.on('error', function() {getend(this, false);});
    }
    // is a repsyn conn
    else {
      var args = [];
      for (var i = 0; i < arguments.length; i++) {
          args.push(arguments[i]);
      }
      var callback = args[args.length-1];
      if (!util.isFunction(callback)) { 
        // don't have a listener, so we have to emit the connect event
        var flag_connect = false;
        var ifconnect = function() {
          if (!flag_connect) {
            flag_connect = true;
            self.conn1 = this;
            self.state = CHOSEN;
            self.emit('connect');
          }
          else {
            if (flag_repsyn) {
              this.end();
            }
          }
        }
      }
      else { 
        // have a listener, so we have to call the connect event right after the first connection is connected
        var flag_connect = false;
        var ifconnect = function() {
          if (!flag_connect) {
            flag_connect = true;
            self.conn1 = this;
            self.state = CHOSEN;
            callback.call(self.conn1);
          }
          else {
            if (flag_repsyn) {
              this.end();
            }
          }
        }
      }
      // make up the new callback function
      args.push(ifconnect);
      var localport = Math.floor(Math.random() * (LOCAL_PORT_HIGH - LOCAL_PORT_LOW)) + LOCAL_PORT_LOW;
      debug("Random Port:", localport);
      // bind to the same local port, using a little trick.
      self.conn1 = new net.Socket({ handle: net._createServerHandle('127.0.0.1', localport, 4)});
      self.conn2 = new net.Socket({ handle: net._createServerHandle('127.0.0.1', localport, 4)});
      // connect!
      self.conn1.connect.apply(self.conn1, args);
      args[0] += 1;
      self.conn2.connect.apply(self.conn2, args);
      // register the event listeners
      this.conn1.on('data', function(data) {getdata(self, data, true);});
      this.conn1.on('end', function() {getend(self, true);});
      this.conn1.on('error', function() {
        if (this.state == ONE_CONN || this.state == CHOSEN) this.emit('error');
        getend(this, true);
      })
    }
  }

  //********** Write Function
  //********** Depend on state while take care of possible callback parameter
  this.write = function() {
    var data = arguments[0];
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }
    
    switch (self.state) {
      case ONE_CONN: // should write on conn1, and then archive the commands
        self.conn1.write.apply(self.conn1, args);
        callback = args.pop();
        if (!util.isFunction(callback)) {
          args.push(callback);
        }
        self.archive_write.push(args);
        break;
      case DUP_CONN: // should write on both conncetions
        callback = args.pop();
        if (!util.isFunction(callback)) {
          args.push(callback);
          self.conn1.write.apply(self.conn1, args);
          self.conn2.write.apply(self.conn2, args);
        }
        else {
          var write_status = false;
          var setstatus = function() {
            if (write_status === false) {
              write_status = true;
              callback.apply(self);
            }
          };
          args.push(setstatus);
          self.conn1.write.apply(self.conn1, args);
          self.conn2.write.apply(self.conn2, args);
        }
        break;
      case CHOSEN: // should write on conn1
        self.conn1.write.apply(self.conn1, args);
        break;
      default:
        self.emit('error', "ENDED");
        break;
    }
  }

  this.end = function(){
    // depend on which one is ended.
    switch (self.state){
      case ONE_CONN:
        self.conn1.end.apply(self.conn1, arguments);
        break;
      case DUP_CONN:
        self.conn1.end.apply(self.conn1, arguments);
        self.conn2.end.apply(self.conn2, arguments);
        break;
      case CHOSEN:
        self.conn1.end.apply(self.conn1, arguments);
        break;
      default:
        break;
    }
  }
  
  
};
util.inherits(Socket, events.EventEmitter);
exports.Socket = Socket;

exports.createServer = function() {
  return Server.apply(this, arguments);
};

exports.connect = function() {
  conn = new Socket();
  conn.connect.apply(conn, arguments);
  return conn;
}
