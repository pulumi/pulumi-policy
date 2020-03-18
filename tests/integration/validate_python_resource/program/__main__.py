import pulumi
import pulumi_random

config = pulumi.Config()
testScenario = config.require_int("scenario")

if testScenario == 1:
    r1 = pulumi_random.RandomUuid("r1")
elif testScenario == 2:
    r2 = pulumi_random.RandomUuid("r2", keepers={})
elif testScenario == 3:
    r3 = pulumi_random.RandomUuid("r3", keepers={ "foo": "bar" })
