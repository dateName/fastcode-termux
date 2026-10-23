import { shellTool } from "./shell.js";
import { pwdTool } from "./pwd.js";
import { readFileTool } from "./read_file.js";
import { readManyTool } from "./read_many.js";
import { writeFileTool } from "./write_file.js";
import { appendFileTool } from "./append_file.js";
import { applyPatchTool } from "./apply_patch.js";
import { copyFileTool } from "./copy_file.js";
import { deleteFileTool } from "./delete_file.js";
import { listFilesTool } from "./list_files.js";
import { makeDirTool } from "./make_dir.js";
import { movePathTool } from "./move_path.js";
import { grepTool } from "./grep.js";
import { replaceInFileTool } from "./replace_in_file.js";
import { statPathTool } from "./stat_path.js";
export const TOOLS = [
    shellTool,
    pwdTool,
    readFileTool,
    readManyTool,
    writeFileTool,
    appendFileTool,
    applyPatchTool,
    copyFileTool,
    deleteFileTool,
    listFilesTool,
    makeDirTool,
    movePathTool,
    grepTool,
    replaceInFileTool,
    statPathTool,
];
