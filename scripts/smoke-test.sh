#!/usr/bin/env bash
# Smoke test for every App API endpoint, run against the deployed dev stage.
#
# Needs the AWS CLI configured for the deploying account, and a fresh cookies.txt in the
# folder you run it from (sign-in tokens last an hour):
#   curl -c cookies.txt -X POST <AuthApiUrl>auth/signin -d '{"username":"...","password":"..."}'
#
# Usage: scripts/smoke-test.sh
set -uo pipefail

# Stack output whose key starts with $2 (CDK adds a hash to some output names).
output() {
  aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?starts_with(OutputKey,'$2')].OutputValue | [0]" --output text
}

API=$(output AppApiStack AppApiEndpoint)
API=${API%/}
KEY=$(aws apigateway get-api-key --api-key "$(output AppApiStack AdminApiKeyId)" \
  --include-value --query value --output text)
TOKEN=$(awk '$6=="token"{print $7}' cookies.txt 2>/dev/null)
TABLE=$(aws cloudformation describe-stack-resources --stack-name AppApiStack \
  --query "StackResources[?starts_with(ResourceType,'AWS::DynamoDB::')].PhysicalResourceId | [0]" \
  --output text)

user=(-H "Cookie: token=$TOKEN")
admin=(-H "x-api-key: $KEY" -H 'Content-Type: application/json')

# The POST tests add Christian Bale (4323) to Se7en (1236), a pair the seed data doesn't have.
role='{"movieId":1236,"actorId":4323,"roleName":"Smoke test role","roleDescription":"Added by smoke-test.sh."}'
delete_test_role() {
  aws dynamodb delete-item --table-name "$TABLE" \
    --key '{"PK":{"S":"m#1236"},"SK":{"S":"a#4323"}}'
}

pass=0
fail=0
# check <expected status> <description> <curl arguments...>
check() {
  local expected=$1 name=$2 status
  shift 2
  status=$(curl -s -o /dev/null -w '%{http_code}' "$@")
  if [ "$status" = "$expected" ]; then
    pass=$((pass + 1))
    printf 'PASS  %s  %s\n' "$status" "$name"
  else
    fail=$((fail + 1))
    printf 'FAIL  %s (expected %s)  %s\n' "$status" "$expected" "$name"
  fi
}

# check_contains <text> <description> <curl arguments...>
check_contains() {
  local text=$1 name=$2
  shift 2
  if curl -s "$@" | grep -q "$text"; then
    pass=$((pass + 1))
    printf 'PASS  ---  %s\n' "$name"
  else
    fail=$((fail + 1))
    printf 'FAIL  ---  %s (response has no "%s")\n' "$name" "$text"
  fi
}

if [ "$(curl -s -o /dev/null -w '%{http_code}' "${user[@]}" "$API/actors/4321")" != 200 ]; then
  echo "Your token in cookies.txt is missing or expired; sign in again first." >&2
  exit 1
fi
delete_test_role

echo "== GET /movies/{movieID}/roles"
check 200 "all roles for a movie"            "${user[@]}" "$API/movies/1234/roles"
check 200 "?actor= filters to one role"      "${user[@]}" "$API/movies/1235/roles?actor=4321"
check 200 "?actor= not in the movie"         "${user[@]}" "$API/movies/1234/roles?actor=4323"
check 400 "movieID not a number"             "${user[@]}" "$API/movies/abc/roles"
check 400 "movieID zero"                     "${user[@]}" "$API/movies/0/roles"
check 400 "movieID too large"                "${user[@]}" "$API/movies/99999999999999999999/roles"
check 400 "?actor= not a number"             "${user[@]}" "$API/movies/1234/roles?actor=xyz"
check 404 "unknown movie"                    "${user[@]}" "$API/movies/9999/roles"
check 404 "?actor= unknown actor"            "${user[@]}" "$API/movies/1234/roles?actor=9999"
check 401 "no token"                                      "$API/movies/1234/roles"
check 401 "invalid token"                    -H "Cookie: token=garbage" "$API/movies/1234/roles"

echo "== GET /actors/{actorID}"
check 200 "actor profile"                    "${user[@]}" "$API/actors/4321"
check 200 "?movie= adds the role"            "${user[@]}" "$API/actors/4321?movie=1236"
check 200 "?movie= not in the movie"         "${user[@]}" "$API/actors/4322?movie=1235"
check 400 "actorID not a number"             "${user[@]}" "$API/actors/abc"
check 400 "?movie= not a number"             "${user[@]}" "$API/actors/4321?movie=abc"
check 404 "unknown actor"                    "${user[@]}" "$API/actors/9999"
check 404 "?movie= unknown movie"            "${user[@]}" "$API/actors/4321?movie=9999"
check 401 "no token"                                      "$API/actors/4321"

echo "== POST /movies/roles"
check 403 "no API key"                       -X POST "$API/movies/roles" -d "$role"
check 403 "wrong API key"                    -X POST -H 'x-api-key: wrong' "$API/movies/roles" -d "$role"
check 403 "user token instead of API key"    -X POST "${user[@]}" "$API/movies/roles" -d "$role"
check 400 "body not JSON"                    -X POST "${admin[@]}" "$API/movies/roles" -d '{oops'
check 400 "body not an object"               -X POST "${admin[@]}" "$API/movies/roles" -d '[1]'
check 400 "missing fields"                   -X POST "${admin[@]}" "$API/movies/roles" -d '{"movieId":1236}'
check 400 "movieId as a string"              -X POST "${admin[@]}" "$API/movies/roles" \
  -d '{"movieId":"1236","actorId":4323,"roleName":"x","roleDescription":"y"}'
check 400 "blank roleName"                   -X POST "${admin[@]}" "$API/movies/roles" \
  -d '{"movieId":1236,"actorId":4323,"roleName":"  ","roleDescription":"y"}'
check 404 "unknown movie"                    -X POST "${admin[@]}" "$API/movies/roles" \
  -d '{"movieId":9999,"actorId":4323,"roleName":"x","roleDescription":"y"}'
check 404 "unknown actor"                    -X POST "${admin[@]}" "$API/movies/roles" \
  -d '{"movieId":1236,"actorId":9999,"roleName":"x","roleDescription":"y"}'
check 201 "new role"                         -X POST "${admin[@]}" "$API/movies/roles" -d "$role"
check 409 "same role again"                  -X POST "${admin[@]}" "$API/movies/roles" -d "$role"
check_contains "Smoke test role" "new role returned by GET roles"  "${user[@]}" "$API/movies/1236/roles?actor=4323"
check_contains "Smoke test role" "new role returned by GET actor"  "${user[@]}" "$API/actors/4323?movie=1236"

echo "== Other"
check 404 "unknown route"                    "$API/nope"
check 404 "unsupported method"               -X DELETE "$API/movies/1234/roles"

delete_test_role
echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
