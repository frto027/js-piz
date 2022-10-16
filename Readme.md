# 简介

在web页面中嵌入沙盒程序

借助WebAssembly技术，可以在网页中启动一个lua虚拟机。通过暴露接口给虚拟机中的程序，让虚拟机来控制网页渲染。

其优势在于虚拟机中的lua程序处于一个完全可控的沙箱环境，与JavaScript渲染进程逻辑隔离，无需担心这些lua程序对网站造成xss攻击。
这一方案允许第三方的程序安全地嵌入自己的网站中。

由于不是一些计算密集的任务，性能上大概不会有严重影响。

后续也会尝试集成一些其它语言。

## lua示例程序

```lua
local a,b,c = dom.getElementById("yes_or_no"),dom.getElementById("yes_or_no1"),dom.getElementById("yes_or_no3")
dom.onClick(b,function() dom.setText(a,"1") end)
dom.onClick(c,function() dom.setText(a,"2") end)
```

目前已经支持LUA，后续可能会支持更多的虚拟机。

## packages

### dom Function

- dom.getElementById 需要任意权限
- dom.setText 需要权限“write_text”
- dom.onClick 需要权限“click”

### Basic Function

- dofile 移除
- loadfile 移除

### Corotine library
全部移除（暂时）

### package library
全部移除

### String library
完整支持

### UTF8 support
完整支持

### Table Manipulation
完整支持

### Mathematical Functions
完整支持

### Input and Output Facilities
全部移除

### Operating System Facilities
全部移除

### Debug Library
全部移除

# LICENSE

MIT License