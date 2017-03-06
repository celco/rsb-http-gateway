#!/bin/bash

plugin_name="RSB_HTTP_GATEWAY"

default_hostname="localhost"
default_port=80
default_timeout=20
default_subsystem=""
default_verbose=false

function print_usage
{
cat << EOF >&2
Usage: $0 <hostname> [<options>]

This script checks health of a given component and returns result in format compatible with Icinga2.

OPTIONS:
   -h      Help (this message)
   -c      Component
   -H      Hostname (default localhost)
   -p      Port (default 80)
   -s      Subsystem (default "$default_subsystem")
   -t      Timeout in seconds (default $default_timeout)
   -v      Verbose mode (default $default_verbose)

   Sample usage:
       ./health-icinga.sh localhost database
       ./health-icinga.sh localhost database -t 5
       ./health-icinga.sh localhost database -s dbConnection

EOF
}

function print_missing_option
{
cat << EOF >&2
Missing option -$1

EOF
    print_usage
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
Hostname:      $hostname
Port:          $port
Component:     $component
Timeout:       $timeout
Subsystem:     $subsystem
URL:           $url
Request body:  $request_body
EOF
}

function print_response
{
cat << EOF >&2
curl Status:   $curl_status
HTTP Status:   $http_status
Response body: $response_body
EOF
}

function exit_ok
{
    echo "$plugin_name OK - $component$1"
    exit 0
}

function exit_warning
{
    echo "$plugin_name WARNING - $component$1"
    exit 1
}

function exit_critical
{
    echo "$plugin_name CRITICAL - $component$1"
    exit 2
}

function exit_unknown
{
    echo "$plugin_name UNKNOWN - $component$1"
    exit 3
}

#--- Optional parameters
hostname=$default_hostname
port=$default_port
timeout=$default_timeout
subsystem=$default_subsystem
verbose=$default_verbose

while getopts ":hvc:H:p:s:t:" opt
do
     case $opt in
         h) print_usage; exit 7 ;;
         c) component=$OPTARG ;;
         H) hostname=$OPTARG ;;
         p) port=$OPTARG ;;
         t) timeout=$OPTARG ;;
         s) subsystem=$OPTARG ;;
         v) verbose=true ;;
         *) print_invalid_option; exit 7 ;;
     esac
done

if [ -z component ]; then
    print_missing_option 'c'
    exit 7
fi

url="$hostname:$port/rpc/GetHealth/$component?timeout=$(($timeout * 1000))"
request_body="{\"subsystemCheckTimeout\": $(($timeout * 9 / 10))}"

if $verbose; then print_request; fi

res=$(curl --silent \
           --write-out "HTTP_STATUS:%{http_code}" \
           --connect-timeout $timeout \
           --max-time $(($timeout + 1)) \
           --header "Content-Type: application/json" \
           --data "$request_body" \
           "$url")
curl_status=$?
http_status=$(echo $res | sed -e 's/.*HTTP_STATUS://')
response_body=$(sed -r 's/HTTP_STATUS:[0-9]+//g' <<< "$res")

if $verbose; then print_response; fi

case $curl_status in
    0)   ;;
    7)   exit_unknown " - Gateway offline" ;;
    28)  exit_unknown " - Gateway timeout" ;;
    *)   exit_unknown " - Gateway communication error: $curl_status" ;;
esac

case $http_status in
    200) ;;
    504) exit_critical " - Component timeout ($response_body)" ;;
    500) exit_critical " - Gateway error ($response_body)" ;;
    404) exit_critical " - Component offline ($response_body)" ;;
    *)   exit_critical " - Unexpected response $http_status ($response_body)" ;;
esac

if [ -z "$subsystem" ]; then
    healthy=$(echo "$response_body" | jq '.healthy')
    case $healthy in
        "true") exit_ok ;;
        *)      exit_warning " - Unhealthy" ;;
    esac
else
    state=$(echo "$response_body" | jq ".subsystems.$subsystem")
    case $state in
        "Healthy") exit_ok " - $subsystem" ;;
        null)      exit_critical " - $subsystem - subsystem not found" ;;
        *)         exit_warning " - $subsystem - $state" ;;
    esac
fi
