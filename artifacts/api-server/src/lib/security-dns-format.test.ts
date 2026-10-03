import { createSocket } from "node:dgram";
import { Resolver } from "node:dns/promises";
import { expect, it } from "vitest";

it("real Node DNS canonicalises IPv4-mapped loopback to the dotted form rejected by the classifier", async () => {
  const socket = createSocket("udp4");
  socket.on("message", (question, remote) => {
    let end = 12;
    while (question[end]) end += question[end] + 1;
    end += 5;
    const header = Buffer.alloc(12);
    question.copy(header, 0, 0, 2);
    header.writeUInt16BE(0x8180, 2);
    header.writeUInt16BE(1, 4);
    header.writeUInt16BE(1, 6);
    // Synthetic AAAA ::ffff:7f00:1, served only by this loopback DNS fixture.
    const record = Buffer.from("c00c001c000100000000001000000000000000000000ffff7f000001", "hex");
    socket.send(Buffer.concat([header, question.subarray(12, end), record]), remote.port, remote.address);
  });
  await new Promise<void>(resolve => socket.bind(0, "127.0.0.1", () => resolve()));
  try {
    const resolver = new Resolver({ timeout: 1000, tries: 1 });
    resolver.setServers([`127.0.0.1:${socket.address().port}`]);
    expect(await resolver.resolve6("fixture.invalid")).toEqual(["::ffff:127.0.0.1"]);
  } finally {
    await new Promise<void>(resolve => socket.close(() => resolve()));
  }
});