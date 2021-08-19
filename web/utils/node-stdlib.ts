import type fs from "fs";
import { promises as fsP } from "fs";

/**
 * Helper function for file exists because using try/catch semantics to accomplish this
 * feels weird
 *
 * @param path a path to test
 * @returns whether that path exists
 */
export async function fileExists(path: fs.PathLike): Promise<boolean> {
  try {
    await fsP.access(path);
    return true;
  } catch (err) {
    return false;
  }
}
