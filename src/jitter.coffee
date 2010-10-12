###
  Jitter, a CoffeeScript compilation utility

  The latest version and documentation, can be found at:
  http://github.com/TrevorBurnham/Jitter

  Copyright (c) 2010 Trevor Burnham
  http://iterative.ly

  Based on command.coffee by Jeremy Ashkenas
  http://jashkenas.github.com/coffee-script/documentation/docs/command.html

  Growl notification code contributed by Andrey Tarantsov
  http://www.tarantsov.com/

  Permission is hereby granted, free of charge, to any person
  obtaining a copy of this software and associated documentation
  files (the "Software"), to deal in the Software without
  restriction, including without limitation the rights to use,
  copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the
  Software is furnished to do so, subject to the following
  conditions:

  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
  OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
  HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
  WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
  OTHER DEALINGS IN THE SOFTWARE.
###

# External dependencies

fs=            require 'fs'
path=          require 'path'
optparse=      require './optparse'
CoffeeScript=  require 'coffee-script'
{spawn, exec}= require 'child_process'

# Banner shown if jitter is run without arguments
BANNER= '''
  Jitter takes a directory of *.coffee files and recursively compiles
  them to *.js files, preserving the original directory structure.

  Jitter also watches for changes and automatically recompiles as
  needed. It even detects new files, unlike the coffee utility.

  Usage:
    jitter coffee-path js-path [test-path]
        '''
# Globals
options= {}
baseSource= ''
baseTarget= ''
baseTest= null
optionParser= null
isWatched= {}
testFiles = []
pending = 0

exports.run= ->
  parseOptions()
  return usage() unless baseTarget
  compileScripts()

compileScripts= ->
  dirs = Source: baseSource, Target: baseTarget
  dirs.Test = baseTest if baseTest
  for name, dir of dirs 
    ++pending
    path.exists dir, (exists) ->
      unless exists
        die "#{name} directory '#{dir}' does not exist."
      else unless fs.statSync(dir).isDirectory()
        die "#{name} '#{dir}' is a file; Jitter needs a directory."
      if --pending == 0
        rootCompile()
        puts 'Watching for changes and new files. Press Ctrl+C to stop.'
        setInterval rootCompile, 500


compile= (source, target) ->
  changed= false
  for item in fs.readdirSync source
    sourcePath= "#{source}/#{item}"
    continue if isWatched[sourcePath]
    if path.extname(sourcePath) is '.coffee'
      readScript sourcePath, target
    else if fs.statSync(sourcePath).isDirectory()
      compile sourcePath, target
    

rootCompile= ->
  compile(baseSource, baseTarget)
  compile(baseTest, baseTest) if baseTest

  
readScript= (source, target) ->
  code = fs.readFileSync source
  compileScript(source, code.toString(), target)
  puts 'Compiled '+ source
  watchScript(source, target)

watchScript= (source, target) ->
  isWatched[source] = true
  fs.watchFile source, {persistent: true, interval: 250}, (curr, prev) ->
    return if curr.mtime.getTime() is prev.mtime.getTime()
    code = fs.readFileSync source
    compileScript(source, code.toString(), target)
    puts 'Recompiled '+ source

compileScript= (source, code, target) ->
  try
    js= CoffeeScript.compile code, {source}
    writeJS source, js, target
  catch err
    puts err.message
    notifyGrowl source, err.message

writeJS= (source, js, target) ->
  base = if target is baseTest then baseTest else baseSource
  filename= path.basename(source, path.extname(source)) + '.js'
  dir=      target + path.dirname(source).substring(base.length)
  jsPath=  path.join dir, filename
  ++pending
  exec "mkdir -p #{dir}", ->
    fs.writeFileSync jsPath, js
    testFiles.push jsPath if target is baseTest and jsPath not in testFiles
    runTests() if --pending == 0 and baseTest
      
notifyGrowl= (source, errMessage) ->
  basename= source.replace(/^.*[\/\\]/, '')
  if m= errMessage.match /Parse error on line (\d+)/
    message= "Parse error in #{basename}\non line #{m[1]}."
  else
    message= "Error in #{basename}."
  args= ['growlnotify', '-n', 'CoffeeScript', '-p', '2', '-t', "\"Compilation failed\"", '-m', "\"#{message}\""]
  exec args.join(' ')

runTests = ->
  for test in testFiles
    puts "running #{test}"
    exec "node #{test}", (error, stdout, stderr) ->
      print stdout
      print stderr
      notifyGrowl test, stderr if stderr

parseOptions= ->
  optionParser= new optparse.OptionParser [], BANNER
  options=    optionParser.parse process.argv
  baseSource= options.arguments[2] if options.arguments[2]
  baseTarget= options.arguments[3] if options.arguments[3]
  baseTest= options.arguments[4] if options.arguments[4]
  if baseSource[-1] is '/' then baseSource = baseSource[0...-1]
  if baseTarget[-1] is '/' then baseTarget = baseTarget[0...-1]

usage= ->
  puts optionParser.help()
  process.exit 0

die= (message) ->
  puts message
  process.exit 1