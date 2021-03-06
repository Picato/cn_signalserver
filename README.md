# Signal Server

Signaling server for clients to connect and do signaling for WebRTC.

It also supports vending STUN/TURN servers
 with the shared secret mechanism as described in
 [this draft](http://tools.ietf.org/html/draft-uberti-behave-turn-rest-00).
 This mechanism is implemented e.g. by [rfc-5766-turn-server](https://code.google.com/p/rfc5766-turn-server/) or by a [patched version](https://github.com/otalk/restund) of [restund](http://creytiv.com/restund.html).

## Running

Running the server requires a valid installation of node.js which can be installed from the nodejs.org website. After installing the package you will need to install the node dependencies.

1) npm install async, node-uuid, redis, underscore, precommit-hook, getconfig, yetify, socket.io

2) run the server using "node server.js"

3) In the console you will see a message which tells you where the server is running:

                        "signal master is running at: http://localhost:8888"

4) Open a web browser to the specified URL and port to ensure that the server is running properly. You should see the message

### Production Environment
* generate your ssl certs

```shell
$ ./scripts/generate-ssl-certs.sh
```
* run in Production mode

```shell
$ NODE_ENV=production node server.js
```

## Use with Express
    var express = require('express')
    var sockets = require('signalmaster/sockets')

    var app = express()
    var server = app.listen(port)
    sockets(server, config) // config is the same that server.js uses
