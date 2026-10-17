# 文章发布与来源说明

正文为 [vite-tutorial.md](vite-tutorial.md)。它可以单独阅读，也通过相对链接连接配套课程。本文针对希望系统使用并理解 Vite 的 JavaScript/TypeScript 开发者，搜索意图是教程与实现解释。

## 元信息

正文 frontmatter 提供 title、description、slug、日期、作者与标签；发布系统需要实际读取这些字段。建议保持单一文章 URL，主标题与 HTML title 表达同一主题。

正式博客地址为 [liuyaowen.cn 的 Vite 教程](https://liuyaowen.cn/posts/web-typescript/vite-tutorial)，配套仓库为 [liyown/vite-study](https://github.com/liyown/vite-study)，本文对应教材标签为 v1.0.0。博客发布稿移除 frontmatter 和重复主标题，并把相对课程链接映射到这个标签下的 GitHub 文件，确保博客与教材可以分别阅读。仓库正文保留相对链接，便于离线阅读。canonical、社交元信息和站点地图由实际站点生成并在发布后检查。

若文章通过客户端应用发布，需要检查服务端返回或预渲染后的 HTML 是否包含正文和可跟随链接。Vite 不自动为任意站点生成文章 SEO 元信息。

## 可追查的证据

文章署名为刘耀文，关联真实 GitHub 主页，未添加不存在的职位、资历或认证。正文说明代码与文字使用 AI 辅助实现和整理，博客 meta.aiGen 设为 2，勘误入口为仓库 Issues。文中区分官方资料、固定提交源码、教学实现和实际测试，不把 Node 教学示例描述成已完成云端部署。

配套仓库固定依赖、提供完整启动和验证命令；验证说明区分自动检查与浏览器观察。接口参考与源码差异保留，读者可以追查限定条件。后续修改影响结论时，应复验相关实验并更新正文的 updated 字段和验证记录。

Google 将 E-E-A-T 用作理解内容质量的框架，并说明它本身不是一个单独的具体排名因素。这里通过可复验经验、准确解释、原始资料和明确边界提供依据，不为文章自封“权威评分”。参见 [Google 以读者为先的内容指南](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)。

当前没有 Search Console 或关键词需求量数据。标题和结构基于内容意图，不宣称已完成搜索量验证或可以保证排名。

## 上线处理

站点可根据可见正文生成 Article 或 BlogPosting JSON-LD，使用真实 headline、author、datePublished、dateModified、mainEntityOfPage 和可用图片。署名、日期与正文保持一致；不要虚构 FAQ 富结果、评分或不存在的图片。具体属性见 [Google Article 结构化数据文档](https://developers.google.com/search/docs/appearance/structured-data/article)。

本稿没有额外注入 JSON-LD；发布时检查站点已有的结构化数据、正文、canonical、robots、状态码、代码块与教材链接。Search Console 和移动设备实测需另行进行。结构化数据只帮助理解内容，不保证富结果展示。

## 编辑原则

主线解释当前实现，避免聊天记录、提示词、工作过程与重复摘要。代码标明示意与实测的差异；不把一组 Hook 画成所有阶段都严格串行；不声称所有 HMR 都保留状态。教学代码保持短小，进阶分支留在后面的课程与附录。

本地 `pnpm check` 验证教材；公开站点的可抓取性、canonical 和收录状态需要在真实 URL 上单独检查。

## 编辑参考

正文的技术依据来自 Vite 等项目的官方资料和配套实验。表达方式另参考了酷壳的 [CPU 缓存知识](https://coolshell.cn/articles/20793.html)、[性能调优攻略](https://coolshell.cn/articles/7490.html)，以及 Cloudflare 的 [Vite 插件介绍](https://blog.cloudflare.com/introducing-the-cloudflare-vite-plugin/)、[Wrangler 与 workerd 本地开发](https://blog.cloudflare.com/wrangler3/)。参考的是具体问题、实验推理和取舍的组织方式，没有移用这些作者的经历、性能数字或个人口吻。
