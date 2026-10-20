/** PNG mínimo (assinatura + IHDR) com a largura e a altura pedidas; basta para o image-size. */
export function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.from([0, 0, 0, 13]),
    Buffer.from('IHDR', 'ascii'),
    ihdr,
    Buffer.alloc(4), // CRC (o image-size não confere)
  ]);
}
