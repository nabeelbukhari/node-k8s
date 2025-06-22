{{- define "node-k8s-loadtest.name" -}}
node-k8s-loadtest
{{- end }}

{{- define "node-k8s-loadtest.fullname" -}}
{{ include "node-k8s-loadtest.name" . }}
{{- end }}
