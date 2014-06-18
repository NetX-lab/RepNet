import os

serverA = open('serverlistA.list', 'r')
serverB = open('serverlistB.list', 'r')
numA = int(serverA.readline())
numB = int(serverB.readline())

iplistA = open('iplistA', 'w')
iplistB = open('iplistB', 'w')

sshconfig = open('/home/lsh/.ssh/config', 'w')
csshconfig = open('/home/lsh/.clusterssh/clusters', 'w')

csshconfig.write("rackA ")
for i in range(numA):
  port = int(serverA.readline())
  #content = "host A" + str(port) + "\n  HostName 192.168.1." + str(port - 30000) + "\n  IdentityFile /home/lsh/.ssh/id_rsa\n"
  content = "host A" + str(port) + "\n  HostName 192.168.1." + str(port - 30000) + "\n  ProxyCommand ssh shuhao@sing.cse.ust.hk -W %h:22" + "\n  IdentityFile /home/lsh/.ssh/id_rsa\n"
  sshconfig.write(content)
  hostname = "A" + str(port) + " "
  csshconfig.write(hostname)
  ipaddr = "192.168.6." + str(port - 30100) + "\n"
  iplistA.write(ipaddr)
iplistA.close()

csshconfig.write("\nrackB ")
for i in range(numB):
  port = int(serverB.readline())
  #content = "host B" + str(port) + "\n  HostName 192.168.1." + str(port - 30000) + "\n  IdentityFile /home/lsh/.ssh/id_rsa\n"
  content = "host B" + str(port) + "\n  HostName 192.168.1." + str(port - 30000) + "\n  ProxyCommand ssh shuhao@sing.cse.ust.hk -W %h:22" + "\n  IdentityFile /home/lsh/.ssh/id_rsa\n"
  sshconfig.write(content)
  hostname = "B" + str(port) + " "
  csshconfig.write(hostname)
  ipaddr = "192.168.7." + str(port - 30106) + "\n"
  iplistB.write(ipaddr)
iplistB.close()

sshconfig.close()
csshconfig.close()
serverA.close()
serverB.close()

csshconfig = open('/home/lsh/.clusterssh/clusters', 'r')
serverA = csshconfig.readline().split()
serverB = csshconfig.readline().split()
csshconfig.close()

for i in range(1, numA+1):
  os.system("echo '" + str(i) + "' > iplist  && cat iplistB >> iplist")
  os.system("scp iplist shuhao@" + serverA[i] + ":~/repflowtestbed/iplist")
  print "Done copying iplist to ", serverA[i]
for j in range(1, numB+1):
  os.system("echo '" + str(i+j) + "' > iplist  && cat iplistA >> iplist")
  os.system("scp iplist shuhao@" + serverB[j] + ":~/repflowtestbed/iplist")
  print "Done copying iplist to ", serverB[j]

os.system("rm iplist*")
