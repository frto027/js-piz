lua_path = 'lua-5.4.4/src/'

emcc_mode = true
debug = false


lua_files = Dir["#{lua_path}*.c"].select {|x| not x.end_with?(
    'lua.c','luac.c','liolib.c','loslib.c' #exclude source files
    )}.join(' ')

if debug
    debug_flag = '-g -O0 '
else
    debug_flag = '-O3 '
end

options = [
    #"INVOKE_RUN=1",
    "ASSERTIONS=0",
    "FILESYSTEM=0",
    "ENVIRONMENT=web",
    "POLYFILL=0",
    "AUTOLOAD_DYLIBS=0",
    "MINIMAL_RUNTIME=1",
    "WEBSOCKET_SUBPROTOCOL=base64"
    #"MALLOC=emmalloc-memvalidate-verbose",
    #"ALLOW_MEMORY_GROWTH=1"
].map{|x|"-s #{x}"}
#-s STANDALONE_WASM
if emcc_mode
    `D:\\emsdk\\emsdk_env.bat && emcc -DEMCC #{debug_flag}-I#{lua_path} main.c #{lua_files} --no-entry #{options.join ' '} --pre-js pre.js -o main.js`

    require "base64"
    File.open("main.wasm","rb") {
        |wasm|
        File.open('main.js','r') {
            |js|
            mainjs = js.read
            url = "data:application/octet-stream;base64," + Base64.encode64(wasm.read()).gsub("\n","")
            out = <<JSOUTPUT
fetch("#{url}").then(function(r){
    r.arrayBuffer().then(function(r){
        loadwasm({wasm:r})
    })
})
function loadwasm(Module){
    #{mainjs}
}
JSOUTPUT
            File.write('out.js',out)
        }
    }
else
    `gcc #{debug_flag} -I#{lua_path} main.c #{lua_files}`
end
