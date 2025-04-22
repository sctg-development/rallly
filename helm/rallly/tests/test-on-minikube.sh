#!/bin/bash

# Launch minikube if not already running
if ! minikube status | grep -q "host: Running"; then
  echo "Starting minikube..."
  minikube start
else
  echo "Minikube is already running."
fi

# Enable the ingress addon if not already enabled
if ! minikube addons list | grep -q "ingress: enabled"; then
  echo "Enabling ingress addon..."
  minikube addons enable ingress
else
  echo "Ingress addon is already enabled."
fi

# Install cert-manager if not already installed
if ! kubectl get pods -n cert-manager | grep -q "cert-manager"; then
  echo "Installing cert-manager..."
  kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.17.0/cert-manager.yaml
  kubectl wait --for=condition=available --timeout=600s deployment/cert-manager -n cert-manager
  kubectl wait --for=condition=available --timeout=600s deployment/cert-manager-webhook -n cert-manager
  kubectl wait --for=condition=available --timeout=600s deployment/cert-manager-cainjector -n cert-manager
else
  echo "Cert-manager is already installed."
fi
# Generate a self-signed root CA certificate and private key if they don't exist
if [ ! -f localhost-rootCA.crt ]; then
  echo "Generating self-signed root CA certificate and private key..."
  openssl req -x509 -sha256 -days 3562 -nodes -newkey rsa:4096 -subj '/CN=demo.local/C=FR/L=Chamonix' -keyout localhost-rootCA.key -out localhost-rootCA.crt

else
  echo "Self-signed root CA certificate and private key already exist."
fi

CRT=$(cat localhost-rootCA.crt | base64 | tr -d '\n')
KEY=$(cat localhost-rootCA.key | base64 | tr -d '\n')
# Generate a Kubernetes certificate for the new CA
cat <<EOF >localhost-ca.yaml
apiVersion: v1
kind: Secret
metadata:
  name: ca-key-pair
  namespace: cert-manager
data:
  tls.crt: ${CRT}
  tls.key: ${KEY}
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: ca-issuer
  namespace: cert-manager
spec:
  ca:
    secretName: ca-key-pair
EOF
# Apply the Kubernetes certificate and issuer
echo "Applying the Kubernetes certificate and issuer..."
kubectl apply -f localhost-ca.yaml

# Wait for the issuer to be ready
echo "Waiting for the issuer to be ready..."
kubectl wait --for=condition=ready --timeout=600s clusterissuer/ca-issuer -n cert-manager

# Create a test certificate
echo "Creating a test certificate..."
cat <<EOF >test-certificate.yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: test-certificate
  namespace: cert-manager
spec:
  secretName: test-certificate-secret
  issuerRef:
    name: ca-issuer
    kind: ClusterIssuer
  commonName: demo.local
  duration: 2160h # 90 days
  renewBefore: 360h # 15 days
  usages:
    - server auth
    - client auth
  dnsNames:
    - demo.local
    - localhost
---
EOF
# Apply the test certificate
echo "Applying the test certificate..."
kubectl apply -f test-certificate.yaml
# Wait for the test certificate to be ready
echo "Waiting for the test certificate to be ready..."
kubectl wait --for=condition=ready --timeout=600s certificate/test-certificate -n cert-manager

#Install Rallly
echo "Installing Rallly..."
helm upgrade --install --create-namespace --namespace rallly rallly ../

echo "For deleting minikube, run the following command:"
echo "minikube delete"
echo "For deleting the CA, run the following command:"
echo "kubectl delete -f localhost-ca.yaml"
echo "For deleting Rallly, run the following command:"
echo "helm delete rallly -n rallly"
