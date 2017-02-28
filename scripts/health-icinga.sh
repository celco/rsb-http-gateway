#!/bin/bash

default_timeout=20
default_subsystem=""
default_verbose=false

function print_usage
{
cat << EOF >&2
Usage: $0 <address> <component> [<options>]

This script checks health of a given component and returns result in format compatible with Icinga2.

OPTIONS:
   -h      Help (this message)
   -s      Subsystem (default "$default_subsystem")
   -t      Timeout in seconds (default $default_timeout)
   -v      Verbose mode (default $default_verbose)

   Sample usage:
       ./health-icinga.sh localhost database
       ./health-icinga.sh localhost database -t 5
       ./health-icinga.sh localhost database -s dbConnection

EOF
}

function print_invalid_option
{
cat << EOF >&2
Invalid option -$OPTARG

EOF
    print_usage
}

function print_request
{
cat << EOF >&2
Address: $address
Component: $component
Timeout: $timeout
Subsystem: $subsystem
URL: $url
EOF
}

function print_response
{
cat << EOF >&2
curl Status: $curl_status
HTTP Status: $http_status
HTTP Body: $body
EOF
}

#--- Required positional parameters
if [ $# -lt 2 ]; then
    print_usage
    exit 1
fi

address="$1"
component="$2"
shift 2

#--- Optional parameters
timeout=$default_timeout
subsystem=$default_subsystem
verbose=$default_verbose

while getopts ":hvs:t:" opt
do
     case $opt in
         h) print_usage; exit 1 ;;
         t) timeout=$OPTARG ;;
         s) subsystem=$OPTARG ;;
         v) verbose=true ;;
         *) print_invalid_option; exit 1 ;;
     esac
done

url="$address/rpc/GetHealth/$component?timeout=$(($timeout * 1000))"

if $verbose; then print_request; fi

res=$(curl --silent \
           --write-out "HTTP_STATUS:%{http_code}" \
           --connect-timeout $timeout \
           --max-time $(($timeout + 1)) \
           --header "Content-Type: application/json" \
           --data "{}" "$url")
curl_status=$?
http_status=$(echo $res | sed -e 's/.*HTTP_STATUS://')
body=$(sed -r 's/HTTP_STATUS:[0-9]+//g' <<< "$res")

if $verbose; then print_response; fi

name="RSB_HTTP_GATEWAY"
critical="$name CRITICAL - $component"
warning="$name WARNING - $component"
ok="$name OK - $component"

case $curl_status in
    0)   ;;
    7)   echo "$critical | Gateway offline"; exit ;;
    28)  echo "$critical | Gateway timeout"; exit ;;
    *)   echo "$critical | Gateway communication error: $curl_status"; exit ;;
esac

case $http_status in
    200) ;;
    504) echo "$critical | Component timeout ($body)"; exit ;;
    500) echo "$critical | Gateway error ($body)" ;;
    404) echo "$critical | Component offline ($body)"; exit ;;
    *)   echo "$critical | Unexpected response $http_status ($body)"; exit ;;
esac

if [ -z "$subsystem" ]; then
    healthy=$(echo "$body" | jq '.healthy')
    case $healthy in
        "true") echo "$ok"; exit ;;
        *)      echo "$warning | Unhealthy"; exit ;;
    esac
else
    state=$(echo "$body" | jq ".subsystems.$subsystem")
    case $state in
        "Healthy") echo "$ok - $subsystem"; exit ;;
        null)      echo "$critical - $subsystem | subsystem not found"; exit ;;
        *)         echo "$warning - $subsystem | $state"; exit ;;
    esac
fi
