import { net } from "electron";
import { writeFile } from "node:fs/promises";

export const downloadFromUrl = (url: string, targetPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = net.request(url);
    request.on("response", (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", async () => {
        try {
          const buffer = Buffer.concat(chunks);
          await writeFile(targetPath, buffer);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      response.on("error", (err) => reject(err));
    });
    request.on("error", (err) => reject(err));
    request.end();
  });
};
