#ifdef EMCC
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#include <math.h>
#include <stdlib.h>
#include <string.h>
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"

lua_State *L;

#define doc_t int

EM_JS(doc_t, docGetElementById, (const char*str),{
    return FUNCS.docGetElementById(charstr);
});

EM_JS(int, docSetText, (doc_t t, const char*text),{
    return FUNCS.docSetElementText(t,chartext);
});

EM_JS(int, docAddOnclickListener,(doc_t t),{
    return FUNCS.docAddOnclickListener(t);
});
EM_JS(void, vmcallback, (const char * callback_name, char* argf, void *args),{
    FUNCS.vmcallback(callback_name, argf, args);
});

int post_cleanup_count = 0;

/* gc strings */
EMSCRIPTEN_KEEPALIVE
void postMessageCleanup(){
    if(post_cleanup_count != 0){
        lua_pop(L,post_cleanup_count);
        post_cleanup_count = 0;
    }
}

EMSCRIPTEN_KEEPALIVE
void postMessage(const char* argf, const char* retf, void * args, void * rets){
    int arg_count = 0;
    lua_assert(sizeof(char*) == sizeof(int));
    lua_assert(sizeof(char*) == sizeof(float));
    lua_getglobal(L, "__postMessage");
    while(argf[arg_count]){
        switch (argf[arg_count])
        {
        case 'S':
            lua_pushstring(L,((char**)args)[arg_count]);
            break;
        case 'I':
            lua_pushinteger(L,((int*)args)[arg_count]);
            break;
        case 'F':
            lua_pushnumber(L,((float*)args)[arg_count]);
            break;
        default:
            lua_pop(L,arg_count);
            fprintf(stderr,"unable to post message, invalid argf format '%c' in %s.", argf[arg_count],argf);
            return;
        }
        arg_count++;
    }
    int retlen = strlen(retf);
    lua_call(L,arg_count, retlen);
    
    post_cleanup_count = retlen; // we don't cleanup the memory at this moment

    int ret_count = 0;
    while(retf[ret_count]){
        switch(retf[ret_count])
        {
        case 'S':
            if(lua_isstring(L,-retlen + ret_count)){
                ((const char**)rets)[ret_count] = lua_tostring(L,- retlen + ret_count);
            }else{
                ((char**)rets)[ret_count] = NULL;
            }
            break;
        case 'I':
            if(lua_isnumber(L,- retlen + ret_count)){
                ((int*)rets)[ret_count] = lua_tointeger(L,- retlen + ret_count);

            }else{
                ((int*)rets)[ret_count] = INT_MIN;
            }
            break;
        case 'F':
            if(lua_isnumber(L,- retlen + ret_count)){
                ((float*)rets)[ret_count] = lua_tonumber(L,- retlen + ret_count);
            }else{
                ((float*)rets)[ret_count] = NAN;
            }
            break;
        default:
            fprintf(stderr,"warning: not support format '%c' in retf %s.", retf[ret_count],retf);
        }
        ret_count++;
    }
    //we don't clean up the memory at this moment (beause all strings are in memory)
}
//vmcallback(name, arg1, arg2, arg3, ...)
static int lua_doCallback(lua_State *L){
    int numarg = lua_gettop(L);

    if(numarg < 1 || !lua_isstring(L,1)){
        return luaL_error(L,"the first argument of vmcall should be string!");
    }
    const char * callback_name = lua_tostring(L,1);

    int extra_numarg = numarg - 1;


    void * args = malloc(extra_numarg * 4);
    char * argf = malloc(extra_numarg + 1);
    for(int i=0;i<extra_numarg;i++){
        if(lua_isinteger(L,i+2)){
            ((int*)args)[i] = lua_tointeger(L,i+2);
            argf[i] = 'I';
        }else if(lua_isnumber(L,i+2)){
            ((float*)args)[i] = lua_tonumber(L,i+2);
            argf[i] = 'F';
        }else if(lua_isstring(L,i+2)){
            ((const char**)args)[i] = lua_tostring(L,i+2);
            argf[i] = 'S';
        }else{
            argf[i] = '-';
        }
    }
    argf[extra_numarg] = '\0';
    vmcallback(callback_name, argf,args);
    return 0;
}

EMSCRIPTEN_KEEPALIVE
const char * execute_lua(char * program,char * origin){
    int status = luaL_loadbuffer(L, program, strlen(program), origin);
    if(status == LUA_OK){
        status = lua_pcall(L,0,0,0);
    }
    if(status == LUA_OK){
        return NULL;
    }
    const char *msg = lua_tostring(L,-1);
    lua_pop(L,1);
    return msg;
}


struct lua_userdata_t
{
    #define LUA_USERDATA_TYPE_DOC 1
    int type;
    union
    {
        doc_t doc;
    }data;
};

EMSCRIPTEN_KEEPALIVE
void onclick(doc_t elem){
    // printf("clicke-d %d\n",elem);
    lua_getglobal(L,"__onclick_callback");
    struct lua_userdata_t * udata = lua_newuserdata(L, sizeof(struct lua_userdata_t));
    udata->type = LUA_USERDATA_TYPE_DOC;
    udata->data.doc = elem;
    lua_call(L,1,0);
}

//============== begin lua funcs ==============
static int lua_docGetElementById(lua_State *L){
    if(lua_isstring(L,1)){
        const char* str = lua_tostring(L,1);
        doc_t result = docGetElementById(str);
        if(result){
            struct lua_userdata_t * data = lua_newuserdata(L,sizeof(struct lua_userdata_t));
            data->type = LUA_USERDATA_TYPE_DOC;
            data->data.doc = result;
        }else{
            /* object not found */
            lua_pushnil(L);
        }
        return 1;
    }else{
        return luaL_error(L,"the first argument of 'getElementById' should be string.");
    }
}
static int lua_setText(lua_State *L){
    if(lua_isuserdata(L,1) && ((struct lua_userdata_t*)lua_touserdata(L,1))->type == LUA_USERDATA_TYPE_DOC){
        doc_t target = ((struct lua_userdata_t*)lua_touserdata(L,1))->data.doc;
        if(lua_isstring(L,2)){
            const char * text = lua_tostring(L,2);
            int result = docSetText(target, text);
            lua_pushboolean(L,result);
            return 1;
        }else{
            return luaL_error(L,"the seconed argument should be a 'string'");
        }
    }else{
        return luaL_error(L,"the first argument should be a 'document' object");
    }
}
static int lua_onclick(lua_State *L){
    if(lua_isuserdata(L,1) && ((struct lua_userdata_t*)lua_touserdata(L,1))->type == LUA_USERDATA_TYPE_DOC){
        doc_t target = ((struct lua_userdata_t*)lua_touserdata(L,1))->data.doc;
        docAddOnclickListener(target);
    }else{
        return luaL_error(L,"the first argument should be a 'document' object");
    }
    return 0;
}
static int lua_docHash(lua_State *L){
    if(lua_isuserdata(L,1) && ((struct lua_userdata_t*)lua_touserdata(L,1))->type == LUA_USERDATA_TYPE_DOC){
        doc_t target = ((struct lua_userdata_t*)lua_touserdata(L,1))->data.doc;
        lua_pushinteger(L, target);
        return 1;
    }else{
        return luaL_error(L,"the first argument should be a 'document' object");
    }
    return 0;
}

static const luaL_Reg domlib[] = {
    {"getElementById", lua_docGetElementById},
    {"setText",lua_setText},
    {"onClick",lua_onclick},
    {"__docHash",lua_docHash},
    {NULL,NULL}
};

int luaopen_dom (lua_State *L) {
  luaL_newlib(L, domlib);
  return 1;
}

LUAMOD_API int (luaopen_base_patch) (lua_State *L);
static const luaL_Reg my_loadedlibs[] = {
  {LUA_GNAME, luaopen_base_patch},
  //{LUA_LOADLIBNAME, luaopen_package},
  //{LUA_COLIBNAME, luaopen_coroutine},
  {LUA_TABLIBNAME, luaopen_table},
  //{LUA_IOLIBNAME, luaopen_io},
  //{LUA_OSLIBNAME, luaopen_os},
  {LUA_STRLIBNAME, luaopen_string},
  {LUA_MATHLIBNAME, luaopen_math},
  {LUA_UTF8LIBNAME, luaopen_utf8},
  //{LUA_DBLIBNAME, luaopen_debug},
  {NULL, NULL}
};
LUALIB_API void my_openlibs (lua_State *L) {
  const luaL_Reg *lib;
  /* "require" functions from 'loadedlibs' and set results to global table */
  for (lib = my_loadedlibs; lib->func; lib++) {
    luaL_requiref(L, lib->name, lib->func, 1);
    lua_pop(L, 1);  /* remove lib */
  }
}



EMSCRIPTEN_KEEPALIVE
int init_vm(){
    L = luaL_newstate();  /* create state */
    my_openlibs(L);
    //add dom library
    {
        luaL_requiref(L, "dom", luaopen_dom, 1);
    }

    //add callback support
    {
        lua_pushglobaltable(L);
        lua_pushcfunction(L, lua_doCallback);
        lua_setfield(L, -2, "vmcallback");
        lua_pop(L,1);
    }

    execute_lua(
        "local __onclick_table = {}\n"
        "local oldOnClick = dom.onClick\n"
        "dom.onClick = function(mdoc,f)\n"
        "    local hash = dom.__docHash(mdoc)\n"
        "    if not __onclick_table[hash] then __onclick_table[hash] = {} end\n"
        "    oldOnClick(mdoc) table.insert(__onclick_table[hash], f)\n"
        "end\n"
        "function __onclick_callback(elem)\n"
        "    local hash = dom.__docHash(elem)\n"
        "    for _,v in pairs(__onclick_table[hash]) do v() end\n"
        "end\n"
        "local message_handlers = {}\n"
        "function __postMessage(name, ...)\n"
            "local handler = message_handlers[name]\n"
            "if handler then return handler(...) end\n"
        "end \n"
        "function onMessage(name, func)\n"
            "message_handlers[name] = func\n"
        "end  \n"


        , "<internal>");

    return 0;
}

#ifndef EMCC
int main(){
    init_vm();
    const char * msg = execute_lua("print('123')","main");
    printf("%x\n",msg);
    if(msg)
    printf("%s",msg);
}
#endif