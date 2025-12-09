const fs = require("fs");
const zlib = require("zlib");

function createIcon(size, filename) {
  const w = size, h = size;
  const png_sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr_data = Buffer.alloc(13);
  ihdr_data.writeUInt32BE(w, 0);
  ihdr_data.writeUInt32BE(h, 4);
  ihdr_data[8] = 8; ihdr_data[9] = 2; ihdr_data[10] = 0; ihdr_data[11] = 0; ihdr_data[12] = 0;
  const ihdr_crc = zlib.crc32(Buffer.concat([Buffer.from("IHDR"), ihdr_data]));
  const ihdr_chunk = Buffer.concat([Buffer.from([0,0,0,13]), Buffer.from("IHDR"), ihdr_data, Buffer.alloc(4)]);
  ihdr_chunk.writeUInt32BE(ihdr_crc, ihdr_chunk.length - 4);
  
  const pixels = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    pixels[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const off = y * (1 + w * 3) + 1 + x * 3;
      pixels[off] = 70; pixels[off + 1] = 130; pixels[off + 2] = 180;
    }
  }
  const compressed = zlib.deflateSync(pixels);
  const idat_crc = zlib.crc32(Buffer.concat([Buffer.from("IDAT"), compressed]));
  const idat_chunk = Buffer.alloc(4 + 4 + compressed.length + 4);
  idat_chunk.writeUInt32BE(compressed.length, 0);
  idat_chunk.write("IDAT", 4);
  compressed.copy(idat_chunk, 8);
  idat_chunk.writeUInt32BE(idat_crc, idat_chunk.length - 4);
  
  const iend_chunk = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  fs.writeFileSync(filename, Buffer.concat([png_sig, ihdr_chunk, idat_chunk, iend_chunk]));
}

createIcon(16, "icons/icon16.png");
createIcon(48, "icons/icon48.png");
createIcon(128, "icons/icon128.png");
console.log("Icons created successfully");
