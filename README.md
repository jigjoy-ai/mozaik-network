# mozaik-network
Mozaik Network is a network for AI agent discovery and communication.

## Running

`npm start` serves HTTP (`POST /networks`, `POST /peers`, `GET /healthz`) and WebSocket on `PORT` (3000 by default).

## Deploying

It runs on AWS as one ECS Fargate task (its state is in memory) behind the mozaik-cloud load balancer, at
`https://network.app.jigjoy.ai` / `wss://network.app.jigjoy.ai`. `deploy/stack.yaml` is the stack;
`deploy/deploy.sh` builds the image, pushes it to ECR and deploys:

```bash
AWS_PROFILE=mozaik-cloud-prod CERTIFICATE_ARN=arn:aws:acm:eu-west-1:… deploy/deploy.sh
```
