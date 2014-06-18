#!/usr/bin/python

# Numpy is a library for handling arrays (like data points)
import numpy as np

# Pyplot is a module within the matplotlib library for plotting
import matplotlib.pylab as plt

sinfile = "sin.txt"
repfile = "rep.txt"
synfile = "repsyn.txt"

sin = np.loadtxt(sinfile)
rep = np.loadtxt(repfile)
syn = np.loadtxt(synfile)

if type(sin[0]) is np.float64:
  y1 = sin
  for i in range(len(y1)):
    y1[i] = y1[i] % 200 + int(y1[i] / 200) * 10
  y2 = rep
  for i in range(len(y2)):
    y2[i] = y2[i] % 200 + int(y2[i] / 200) * 10
  y3 = syn
  for i in range(len(y3)):
    y3[i] = y3[i] % 200 + int(y3[i] / 200) * 10

else:
  len1 = len(sin[:,0])
  len2 = len(rep[:,0])
  len3 = len(syn[:,0])

  y1 = sin[:,0] 
  y2 = rep[:,0]
  y3 = syn[:,0]

#  for i in range(len1):
#    #y1[i] = np.percentile(sin[i, :], 99)
#    y1[i] = max(sin[i, :])
#    y1[i] = y1[i] % 200 + int(y1[i] / 200) * 10
#
#  for i in range(len2):
#    #y2[i] = np.percentile(rep[i, :], 99)
#    y2[i] = max(rep[i, :])
#    y2[i] = y2[i] % 200 + int(y2[i] / 200) * 10
#
#  for i in range(len3):
#    #y3[i] = np.percentile(rep[i, :], 99)
#    y3[i] = max(syn[i, :])
#    y3[i] = y3[i] % 200 + int(y3[i] / 200) * 10

average1 = sum(y1)/len(y1)
average2 = sum(y2)/len(y2)
average3 = sum(y3)/len(y3)
max1 = max(y1)
max2 = max(y2)
max3 = max(y3)

print "**********************"
print "Single;%d;%f;%f;%f;%f" % (len(y1), average1, np.percentile(y1, 50, interpolation='nearest'), \
  np.percentile(y1, 99, interpolation='nearest'), np.percentile(y1, 99.9, interpolation='nearest'))
print "Replic;%d;%f;%f;%f;%f" % (len(y2), average2, np.percentile(y2, 50, interpolation='nearest'), \
  np.percentile(y2, 99, interpolation='nearest'), np.percentile(y2, 99.9, interpolation='nearest'))
print "RepSYN;%d;%f;%f;%f;%f"  % (len(y3), average3, np.percentile(y3, 50, interpolation='nearest'), \
  np.percentile(y3, 99, interpolation='nearest'), np.percentile(y3, 99.9, interpolation='nearest'))
print "**********************\n"

x = [0, 50] + range(60, 91, 10) + [93] + range(95, 99) + list(np.arange(99,100,0.1))
p1 = []
p2 = []
p3 = []
xlab = []
for i in x:
  p1.append(np.percentile(y1, i, interpolation='nearest'))
  p2.append(np.percentile(y2, i, interpolation='nearest'))
  p3.append(np.percentile(y3, i, interpolation='nearest'))
  xlab.append(str(i))

p1[0] = average1
p2[0] = average2
p3[0] = average3
xlab[0] = "Avg"

plt.xticks(range(len(x)), xlab)
plt.plot(range(len(x)), p1, 'ro-', label="Single Flow")
plt.plot(range(len(x)), p2, 'b*-', label="Replic Flow")
plt.plot(range(len(x)), p3, 'gx-', label="RepSYN Flow")
plt.legend(loc='upper left')
#plt.yscale('log')
plt.show()
