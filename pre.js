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
ready = function(){
    _init_vm();
    function execute_target(target){
        if(typeof(target) == 'string'){
            execute_lua(target, '<anymous>')
        }else{
            execute_lua(target[0],target[1] || '<anymous>')
        }
    }
    if(window.luaQueue){
        for(var i=0;i<window.luaQueue.length;i++){
            var target = window.luaQueue[i]
            execute_target(target)
        }
    }
    window.luaQueue = {
        push:execute_target
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
    }
}