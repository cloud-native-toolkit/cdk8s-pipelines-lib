import { Yaml } from 'cdk8s';
import { ParameterBuilder, TaskBuilder, TaskStepBuilder } from 'cdk8s-pipelines';
import { Construct } from 'constructs';
import { openshift_client } from './tektonHub/tektonHubTasks';

export const DefaultCatalogSourceNamespace: string = 'openshift-marketplace';

/**
 * Uses the Tekton Hub [openshift_client](https://hub.tekton.dev/tekton/task/openshift-client)
 * and the `oc apply -f` command to apply the YAML representation of `input`.
 *
 * @param scope The parent [Construct](https://cdk8s.io/docs/latest/basics/constructs/).
 * @param id The `id` of the construct. Must be unique for each one in a chart.
 * @param input The input object that will be converted to YAML and applied to the cluster using `oc apply -f`
 * @constructor
 */
export function ApplyObjectTask(scope: Construct, id: string, input: any): TaskBuilder {
  return openshift_client(scope, id).withStringParam(new ParameterBuilder('SCRIPT').withValue(
    ['cat <<EOF | oc apply -f -', Yaml.stringify(input), 'EOF', ''].join('\n')),
  );
}

/**
 * Creates a Namespace document with the given name.
 *
 * This function creates a `TaskBuilder` to generate a task that uses the
 * openshift_client Tekton Task to apply a namespace document to the
 * cluster to create a namespace with the provided value.
 *
 * ```typescript
 * const task = CreateNameSpaceTask(this, 'create-namespace', 'my-example-namespace');
 * ```
 *
 * @param scope The parent [Construct](https://cdk8s.io/docs/latest/basics/constructs/).
 * @param id The `id` of the construct. Must be unique for each one in a chart.
 * @param name The string value name of the namespace to configure.
 *
 * @see
 */
export function CreateNamespace(scope: Construct, id: string, name: string): TaskBuilder {
  // TODO: validate the namespace and potentially throw an error if it is
  // malformed? Also, consider using objects from the cdk8s-plus for this.
  const createNamespace = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: name,
      labels: {
        name: name,
      },
    },
  };

  return ApplyObjectTask(scope, id, createNamespace);
}

/**
 * Creates a builder for the pipeline task that registers the IBM Operator
 * Catalog using `oc apply -f` with a configuration file.
 *
 * This function creates a `TaskBuilder` to generate a task that uses the
 * openshift_client Tekton Task.
 *
 * ```typescript
 * const task = RegisterIBMOperatorCatalog(this, 'register-ibm-operator-catalog', '45');
 * ```
 *
 * @param scope The parent [Construct](https://cdk8s.io/docs/latest/basics/constructs/).
 * @param id The `id` of the construct. Must be unique for each one in a chart.
 * @param labels The labels to give the CatalogSource.
 * @param refreshIntervalMin The amount of time, in minutes, between catalog refreshes.
 * @constructor
 */
export function RegisterIBMOperatorCatalog(scope: Construct, id: string, labels: any, refreshIntervalMin: number = 60): TaskBuilder {
  const ibmOperatorCatalogSource = {
    apiVersion: 'operators.coreos.com/v1alpha1',
    kind: 'CatalogSource',
    metadata: {
      name: 'ibm-operator-catalog',
      namespace: 'openshift-marketplace',
      labels: labels,
    },
    spec: {
      displayName: 'IBM Operator Catalog',
      publisher: 'IBM',
      sourceType: 'grpc',
      image: 'icr.io/cpopen/ibm-operator-catalog',
      updateStrategy: {
        registryPoll: {
          interval: `${refreshIntervalMin.toString()}m`,
        },
      },
    },
  };

  return ApplyObjectTask(scope, id, ibmOperatorCatalogSource);
}

/**
 * Creates a builder for a pipeline task that creates an OperatorGroup
 * using `oc apply -f` with a configuration file.
 *
 * This function creates a `TaskBuilder` to generate a task that uses the
 * openshift_client Tekton Task.
 *
 * ```typescript
 * const task = CreateOperatorGroup(this, 'create-operator-group', 'ibm-eventautomation-operatorgroup', 'ibm-eventstreams');
 * ```
 *
 * @param scope The parent [Construct](https://cdk8s.io/docs/latest/basics/constructs/).
 * @param id The `id` of the construct. Must be unique for each one in a chart.
 * @param ns The namespace for the OperatorGroup.
 * @param name The name of the OperatorGroup.
 * @param targetNs If provided, it is the target namespace for the OperatorGroup.
 * @constructor
 */
export function CreateOperatorGroup(scope: Construct, id: string, ns: string, name: string, targetNs: string = ''): TaskBuilder {
  let operatorGroupSource = {};
  if (targetNs) {
    operatorGroupSource = {
      apiVersion: 'operators.coreos.com/v1',
      kind: 'OperatorGroup',
      metadata: {
        name: name,
        namespace: ns,
      },
      spec: {
        targetNamespaces: [targetNs],
      },
    };
  } else {
    operatorGroupSource = {
      apiVersion: 'operators.coreos.com/v1',
      kind: 'OperatorGroup',
      metadata: {
        name: name,
        namespace: ns,
      },
    };
  }

  return ApplyObjectTask(scope, id, operatorGroupSource);
}

/**
 * Creates a builder for a pipeline task that creates a Subscription using
 * `oc apply -f` with a configuration file.
 *
 * This function creates a `TaskBuilder` to generate a task that uses the
 * openshift_client Tekton Task.
 *
 * ```typescript
 * const task =  Subscribe(this, 'install-eventstreams', 'ibm-eventstreams', 'ibm-eventstreams', 'ibm-operator-catalog', 'stable');
 * ```
 *
 * @param scope The parent [Construct](https://cdk8s.io/docs/latest/basics/constructs/).
 * @param id The `id` of the construct. Must be unique for each one in a chart.
 * @param ns The namespace for the Subscription.
 * @param name The name of the Subscription.
 * @param catalogSource The name of the catalog source. If using IBM operators, that is `ibm-operator-catalog`
 * @param channel The name of the channel. It defaults to `stable`, but it could be something like `v3.3`.
 * @constructor
 */
export function Subscribe(scope: Construct, id: string, ns: string, name: string, catalogSource: string, channel: string = 'stable'): TaskBuilder {
  const subscription = {
    apiVersion: 'operators.coreos.com/v1alpha1',
    kind: 'Subscription',
    metadata: {
      name: name,
      namespace: ns,
    },
    spec: {
      channel: channel,
      name: name,
      source: catalogSource,
      sourceNamespace: DefaultCatalogSourceNamespace,
    },
  };
  return ApplyObjectTask(scope, id, subscription);
}

/**
 * Creates a builder for a pipeline task that uses an busybox image to echo out the
 * given message.
 *
 * @param scope The parent [Construct](https://cdk8s.io/docs/latest/basics/constructs/).
 * @param id The `id` of the construct. Must be unique for each one in a chart.
 * @param message The message for the task to echo to the output.
 * @constructor
 */
export function EchoMessage(scope: Construct, id: string, message: string): TaskBuilder {
  // TODO: sanitize input for the message to make sure it has no injection attacks
  return new TaskBuilder(scope, id)
    .withName('echo-message')
    .withDescription('Echos a message out to the pipeline')
    .withStep(new TaskStepBuilder()
      .withName('echo-message')
      .withImage('docker.io/library/busybox:latest')
      .withCommand(['echo', `\"${message}\"`]));
}