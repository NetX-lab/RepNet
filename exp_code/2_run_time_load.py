""" Run the RepFlow testing script.
Takes exactly ONE argument: The lasting time of the experiment in SECONDS """

import os
import random
import time
import sys

#cucurrent connections for short flows
CONCURRENT_CONN = 1
FLOW_THRED = 100

# DCTCP Distribution
# WARNING: There should be a 100KB size sample point
distsize = [0, 6, 13, 19, 33, 53, 100, 133, 667, 1333, 3333, 6667, 20000]
distpercentage = [0, 0.15, 0.2, 0.3, 0.4, 0.53, 0.58, 0.6, 0.7, 0.8, 0.9, 0.97, 1]

# calibrate distribution
for i in range(0, len(distpercentage)):
  if distsize[i + 1] > FLOW_THRED:
    break
# distpercentage[i] is the total probability for small flows
calipoint = distpercentage[i]
ratio = (1-calipoint/CONCURRENT_CONN) / (1-calipoint)
for j in range(0, i+1):
  distpercentage[j] /= CONCURRENT_CONN
for j in range(i+1, len(distpercentage)-1):
  distpercentage[j] = (distpercentage[j] - calipoint) * ratio + calipoint / CONCURRENT_CONN

print distpercentage
time.sleep(1)

load = float(sys.argv[2])
avg = 0
for i in range(0, len(distsize) - 1):
  if distsize[i] < 100:
    avg += (distsize[i] + distsize[i+1]) * (distpercentage[i+1] - distpercentage[i]) / 2 * CONCURRENT_CONN
  else:
    avg += (distsize[i] + distsize[i+1]) * (distpercentage[i+1] - distpercentage[i]) / 2

avg = avg * 940 / 1024 / 128
time_int = avg / load / 1000
print "Average flow interval: ", time_int

#sleep time interval in seconds
TIME_INT_MAX = time_int * 1.5
TIME_INT_MIN = time_int * 0.5

def getflowsize(sz, p):
  """ Randomly generate a flow size.
  *************INPUT************
  sz -- a list of flow size in a CDF
  p -- a list of percentage in the same CDF
  ************OUTPUT************
  size -- generated flow size (in KB) """

  points = len(distpercentage)
  #choose a value range
  rd = random.random()
  for i in range(0, points):
    if rd < distpercentage[i + 1]:
      break
  #generate the flow size
  rd = random.random()
  size = distsize[i] + rd * (distsize[i+1] - distsize[i])
  if size < 0.02:
    size = 0.02
  return size

#--------------------------------------------
# Here are the main functions
#--------------------------------------------


# cleaning
os.system("rm *.txt")
os.system("killall node")
# start self as servers
os.system("node server.js > nodeserverlog.log &")

time.sleep(1)
# read the other server ip addresses in a list
f = open('iplist', 'r')
myrank = "_" + f.readline()[:-1] + "_"
iplist = f.read().splitlines()
num = len(iplist)
end_time = float(sys.argv[1]) + time.time()
f.close()

while time.time() < end_time:
  size = getflowsize(distsize, distpercentage)
  interval = random.random() * (TIME_INT_MAX - TIME_INT_MIN) + TIME_INT_MIN
  server = ""
  for i in range(CONCURRENT_CONN):
    server = server + iplist[random.randint(0, num-1)] + " "
  time.sleep(interval)
  # print "Sending Flow Size: %f KBytes After %f ms" % (size, interval*1000)

  # if it is a large flow, initiate an iperf client
  if size > FLOW_THRED:
    os.system("node client.js " + str(size) + " 1 " + server + " > longflowlog.log &")
  # if it is a small flow
  else:
    flag_rep = 3 * random.random()
    if flag_rep < 1:
      os.system("node client.js " + str(size) + " " + str(CONCURRENT_CONN) + " " + server + " >> " + myrank + "sin.txt &")
    elif flag_rep < 2:
      os.system("node repclient.js " + str(size) + " " + str(CONCURRENT_CONN) + " " + server + " >> " + myrank + "rep.txt &")
    else:
      os.system("node repsynclient.js " + str(size) + " " + str(CONCURRENT_CONN) + " " + server + " >> " + myrank + "repsyn.txt &")
  
os.system("rm *.log")
