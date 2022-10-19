function execute_lua(js_str, js_orig_str){
    var slen = lengthBytesUTF8(js_str) + 1
    var ptr = _malloc(slen);
    stringToUTF8(js_str,ptr,slen);

    var slen = lengthBytesUTF8(js_orig_str) + 1
    var optr = _malloc(slen);
    stringToUTF8(js_orig_str,optr,slen);

    var ret = _execute_lua(ptr,optr);
    _free(ptr);
    _free(optr);

    if(ret != 0){
        console.log(UTF8ToString(ret,1024*1024));
    }
}

function parseHeapArgs(argf, arg_buffer){
    var heap = HEAP32
    var heapf = HEAPF32

    var argflen = argf.length
    /* limit argument count */
    if(argflen > 1024){
        argflen = 1024
    }
    var ret = new Array(argf.length)
    for(var i=0;i<argflen;i++){
        switch(argf[i]){
            case 'S':
                var ptr = heap[(arg_buffer>>2)+i]
                if(ptr == 0){
                    ret[i] = undefined
                }else{
                    ret[i] = UTF8ToString(ptr, 1024*1024)
                }
                break
            case 'I':
                ret[i] = heap[(arg_buffer>>2)+i]
                break
            case 'F':
                ret[i] = heapf[(arg_buffer>>2)+i]
                break
            default:
                console.error("unknwon format ",retf[i]," in retf ",retf)
        }
    }
    return ret
}
function makeHeapArgs(argf, args){
    var heap = HEAP32
    var heapf = HEAPF32
    var arg_buffer = _malloc(argf.length * 4)
    var string_lists = []

    for(var i=0;i<argf.length;i++){
        var arg = args[i]
        switch(argf[i]){
            case 'S':
                if(typeof(arg) != "string"){
                    heap[(arg_buffer >> 2) + i] = 0
                }else{
                    var alen = lengthBytesUTF8(arg)+1
                    var s = _malloc(alen)
                    string_lists.push(s)
                    stringToUTF8(arg,s,alen)
                    heap[(arg_buffer>>2)+i]=s
                }
                break
            case 'I':
                if(typeof(arg) == "number"){
                    heap[(arg_buffer >> 2) + i] = arg || 0
                }else{
                    heap[(arg_buffer >> 2) + i] = 0x7FFFFFFF
                }
                break
            case 'F':
                if(typeof(arg) == "number"){
                    heapf[(arg_buffer>>2) + i] = arg
                }else{
                    heapf[(arg_buffer>>2) + i] = NaN
                }
                break
            default:
                console.error("unknown format ",argf[i], " in argf ",argf)
        }
    }
    return {
        arg_buffer : arg_buffer,
        free:function(){
            _free(arg_buffer)
            for(var i=0;i<string_lists.length;i++){
                _free(string_lists[i])
            }    
        }
    }
}

var callback_table = new Map()
ready = function(){
    _init_vm();

    /*
    usage:

    window.onLuaInit = window.onLuaInit || []
    window.onLuaInit.push(function(module){
        //do something here
        window.luaExecute("print('hello, world')", "main.lua")

    })

    */

    window.luaExecute = function(code, name){
        execute_lua(code, name || "<anymous>")
    }
    /*
    js --post-message--> lua
    window.luaPostMessage("IIISF","SSII",int,int,int,string,float) => [string,string,int,int]
    */

    window.luaPostMessage = function(argf, retf /* ... args */){
        var argslen = argf.length
        var args = _malloc(argslen + 1)
        var retslen = retf.length
        var rets = _malloc(retslen + 1)
        stringToUTF8(argf,args,argslen+1)
        stringToUTF8(retf,rets,retslen+1)
        
        var ret_buffer = _malloc(retslen * 4)

        try{
            var heap_args = new Array(arguments.length - 2)
            for(var i=0;i<heap_args.length;i++){
                heap_args[i] = arguments[2+i]
            }
            heap_args = makeHeapArgs(argf, heap_args)
            try{
                _postMessage(args, rets, heap_args.arg_buffer, ret_buffer)
                return parseHeapArgs(retf, ret_buffer)
            }finally{
                _postMessageCleanup()
                heap_args.free()
            }
        }finally{
            _free(args)
            _free(rets)
            _free(ret_buffer)
        }
    }
    //callback is functions, vm --call--> callback(js)
    //window.luaRegisterCallback("clickMe", "SIII", "", function(name, times1,times2,times3){})
    window.luaRegisterCallback = function(callback_name, argf, retf, callback){
        callback_table.set(callback_name,{
            argf:argf,
            retf:retf,
            callback:callback /* function(...argf) => [...retf] */
        })
    }


    
    if(window.onLuaInit){
        for(var i=0;i<window.onLuaInit.length;i++){
            window.onLuaInit[i](Module)
        }
    }

    window.onLuaInit = {
        push:function(f){
            f(Module)
        }
    }
}

out = function(text){
    console.log("LUA Message:",text)
}
err = function(text){
    console.error("LUA Message:",text)
}

var next_lua_data_index = 1
var lua_doc_maps = new Map()
var FUNCS = {
    docGetElementById: function(charstr){
        var idstr = UTF8ToString(charstr,1024)
        var elem=document.getElementById(idstr);
        if(elem == undefined){
            console.log("lua env: element not found:" + idstr)
            return 0
        }
        if(elem.lua_data == undefined){
            var permission = elem.getAttribute('src-lua-permission');
            if(permission != undefined){
                elem.lua_data = {
                    index: next_lua_data_index++,
                    permission: new Set(permission.split('|'))
                }
                lua_doc_maps.set(elem.lua_data.index, elem)
                return elem.lua_data.index
            }else{
                console.log("lua env: element has no permission! (" + idstr + ")")
                return 0
            }
        }else{
            return elem.lua_data.index
        }
    },
    docSetElementText(t,text){
        var elem = lua_doc_maps.get(t)
        if(elem == undefined || elem.lua_data == undefined || elem.lua_data.index != t){
            console.error("Lua program try to touch invalid element target:<",t,">",elem)
            return 0
        }
        if(!elem.lua_data.permission.has("write_text")){
            console.error("Lua program try to write element text, but has no 'write_text' permission.",elem,elem.lua_data)
            return 0
        }
        var text = UTF8ToString(text,1024*1024*256) /* limit to 256M word */
        elem.innerText = text
        return 1
    },
    docAddOnclickListener(t){
        var elem = lua_doc_maps.get(t)
        if(elem == undefined || elem.lua_data == undefined || elem.lua_data.index != t){
            console.error("Lua program try to touch invalid element target:<",t,">",elem)
            return 0
        }
        if(!elem.lua_data.permission.has("click")){
            console.error("Lua program try to listen click event, but has no 'click' permission.",elem,elem.lua_data)
            return 0
        }
        if(elem.lua_data.listened){
            return 2
        }
        elem.lua_data.listened = true
        elem.addEventListener('click',function(){
            _onclick(t)
        })
    },
    vmcallback(callback_name, argf, args, retf, rets){
        var callback_name_str = UTF8ToString(callback_name, 1024)
        var argf_str = UTF8ToString(argf, 100)
        if(!callback_table.has(callback_name_str))
            return;
        var cbinfo = callback_table.get(callback_name_str)
        var argf_cb = cbinfo.argf
        var args = parseHeapArgs(argf_str, args)
        for(var i=0;i<argf_cb.length;i++){
            if(argf_str[i] != argf_cb[i]){
                //type convert
                switch(argf_cb[i]){
                    case 'S':
                        if(args[i] != undefined){
                            args[i] = args[i].toString()
                        }
                        break
                    case 'I':
                        if(argf_str[i] == 'F'){
                            args[i] = Math.floor(args[i])
                        }else{
                            args[i] = undefined
                        }
                        break
                    case 'F':
                        if(argf_str[i] == 'I'){
                            //do nothing
                        }else{
                            args[i] = undefined
                        }
                        break
                    default:
                        console.error("unknown format ",argf_cb[i], " in ", argf_cb)
                }
            }
        }

        var ret_array = cbinfo.callback.apply(/* this is 'Module' */Module, args)
        var rets_infos = makeHeapArgs(cbinfo.retf, ret_array || [])
        /* we MUST free the retf and rets in C program! */
        var retflen = lengthBytesUTF8(cbinfo.retf)
        var retf_str = _malloc(retflen+1)
        stringToUTF8(cbinfo.retf,retf_str, retflen+1)
        HEAP32[retf>>2]=retf_str
        HEAP32[rets>>2]=rets_infos.arg_buffer
    }
}