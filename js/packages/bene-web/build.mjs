import cp from "child_process";

let cmd = "wasm-pack build --target web";
if (process.argv.includes("--release")) cmd += ' --release';
cp.execSync(`cd rs-utils && ${cmd}`);
