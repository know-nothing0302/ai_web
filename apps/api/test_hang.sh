#!/bin/bash
test_func() {
    bash -c "sleep 5 & echo \$!"
}
pid=$(test_func)
echo "Got pid: $pid"
