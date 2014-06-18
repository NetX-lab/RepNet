#!/usr/bin/python

import os
import sys
import time

f = open("/home/lsh/.clusterssh/clusters", 'r')
serverlist = f.readline().split()[1:]
serverlist = serverlist + f.readline().split()[1:]
f.close()
servernum = len(serverlist)

for host in serverlist:
  cmd = "scp shuhao@" + host + ":~/repflowtestbed/*.txt ~/git/repflowtestbed/ "
  os.system(cmd)

# time.sleep(10)

fsin = open("sin.txt", "w")
frep = open("rep.txt", "w")
frepsyn = open("repsyn.txt", "w")
for i in range(1, servernum+1):
  sin = open("_" + str(i) + "_sin.txt", "r")
  rep = open("_" + str(i) + "_rep.txt", "r")
  repsyn= open("_" + str(i) + "_repsyn.txt", "r")

  sinline = sin.readline()
  repline = rep.readline()
  repsynline = repsyn.readline()
  while len(sinline) > 0:
    if len(sinline) > 2:
      fsin.write(sinline)
    sinline = sin.readline()
  while len(repline) > 0:
    if len(repline) > 2:
      frep.write(repline)
    repline = rep.readline()
  while len(repsynline) > 0:
    if len(repsynline) > 2:
      frepsyn.write(repsynline)
    repsynline = repsyn.readline()

  fsin.write("\n")
  frep.write("\n")
  frepsyn.write("\n")
  sin.close()
  rep.close()
  repsyn.close()

fsin.close()
frep.close()
frepsyn.close()
os.system("rm _*")
