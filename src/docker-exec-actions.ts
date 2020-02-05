import { Red, Node } from 'node-red';
import { DockerConfiguration } from './docker-configuration';
import * as Dockerode from 'dockerode';
let stream = require('stream');

module.exports = function (RED: Red) {
 

    function DockerExecAction(n: any) {
        RED.nodes.createNode(this, n);
        let config = RED.nodes.getNode(n.config) as unknown as DockerConfiguration;
        let client = config.getClient();
        this.on('input', (msg) => {

            let cid: string = n.container || msg.payload.container || msg.container || undefined;
            let action = n.action || msg.action || msg.payload.action || undefined;
            let cmd = n.cmd || msg.cmd|| msg.command || msg.payload.command || undefined;

            if (cid === undefined) {
                this.error("Container id/name must be provided via configuration or via `msg.container`");
                return;
            }
            this.status({});
            executeAction(cid, client, action, cmd, this,msg);
        });

        function executeAction(cid: string, client: Dockerode, action: string, cmd: any, node: Node,msg) {

            let container = client.getContainer(cid);

            switch (action) {


                case 'exec':
                    let options = {
                        Cmd: ['sh', '-c', cmd],
                        AttachStdout: true,
                        AttachStderr: true
                    };
                    container.exec(options)
                        .then(res => {
                            if (res) {
                                res.start((err, input_stream) => {
                                    if (err) {
                                        //console.log("error : " + err);
                                        return;
                                    }

                                    var stdout = new stream.PassThrough();
                                    var stderr = new stream.PassThrough();
                                    container.modem.demuxStream(input_stream, stdout, stderr);

                                    let buffer_stdout = "";
                                    stdout.on('data', (chunk) => {
                                        buffer_stdout += chunk.toString();
                                    });

                                    let buffer_stderr = "";
                                    stderr.on('data', (chunk) => {
                                        buffer_stderr += chunk.toString();
                                    });

                                    input_stream.on('end', () => {
                                        node.send(Object.assign(msg,{ payload: buffer_stdout }));                                       
                                        if(buffer_stderr.trim().length>0){
                                            node.error(`Error exec container: ${buffer_stderr}`);
                                        }
                                    });
                                });
                            }

                        }).catch(err => {
                            if (err.statusCode === 404) {
                                node.error(`No such container: [${cid}]`);
                                node.send({ payload: err });
                            } else if (err.statusCode === 500) {
                                node.error(`Server Error: [${err.statusCode}] ${err.reason}`);
                                node.send({ payload: err });
                            } else {
                                node.error(`Sytem Error:  [${err.statusCode}] ${err.reason}`);
                                return;
                            }
                        });
                    break;


                default:
                    node.error(`Called with an unknown action: ${action}`);
                    return;
            }
        }
    }

    RED.nodes.registerType('docker-exec-actions', DockerExecAction);
}
