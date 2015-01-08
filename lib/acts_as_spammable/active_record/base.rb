module ActiveRecord
  class Base
    class << self

      def acts_as_spammable(options={})

        include Rakismet::Model

        acts_as_flaggable
        rakismet_fields = options[:fields]
        # set up the rakismet attributes. Concatenate multiple
        # fields using periods as if sentences
        rakismet_attrs :author => proc { self.user ? self.user.name : nil },
                       :author_email => proc { self.user ? self.user.email : nil },
                       :content => proc {
                         options[:fields].map{ |f|
                           self.respond_to?(f) ? self.send(f) : nil
                         }.compact.join(". ")
                       },
                       :comment_type => options[:comment_type]

        after_save :check_for_spam

        scope :flagged_as_spam,
          joins(:flags).where({ flags: { flag: Flag::SPAM } })
        scope :not_flagged_as_spam,
          joins("LEFT JOIN flags f ON (#{ table_name }.id=f.flaggable_id
            AND f.flaggable_type='#{ name }' AND f.flag='#{ Flag::SPAM }')").
          where("f.id IS NULL")

        define_method(:flagged_as_spam?) do
          self.flags.loaded? ?
            self.flags.any?{ |f| f.flag == Flag::SPAM } :
            self.class.flagged_as_spam.exists?(self)
        end

        # If any of the rakismet fields have been modified, then
        # call the akismet API and update the flags on this object.
        # Flags are made with user_id = 0, representing automated flags
        define_method(:check_for_spam) do
          # leveraging the new attribute `disabled`, which we set to
          # true if we are running tests. This can be overridden by using
          # before and after blocks and manually changing Rakismet.disabled
          if Rakismet.disabled.nil?
            Rakismet.disabled = Rails.env.test?
          end
          unless Rakismet.disabled
            # if there is any overlap between the fields that could be spam
            # and the fields that have been changed this time around
            # & is the set intersection operator
            if (self.changed.map(&:to_sym) & rakismet_fields).any?
              # when all the fields we care about are blank, we don't have spam
              # and don't need to call the akismet API. This is also the only
              # place that the akismet API is called outside of specs
              is_spam = rakismet_fields.all?{ |f| self.send(f).blank? } ?
                false : spam?
              if is_spam
                self.add_flag( flag: "spam", user_id: 0 )
              elsif self.flagged_as_spam?
                Flag.delete_all(flaggable_id: self.id, flaggable_type: self.class,
                  user_id: 0, flag: Flag::SPAM)
              end
            end
          end
        end

        # this is a callback that comes from the acts_as_flaggable module.
        # This method is called any time is flag is created with this
        # instance as its subject (flaggable). We're using it to keep
        # the creator's spam_count up-to-date
        define_method(:flagged_with) do |flag, options|
          if flag.flag == Flag::SPAM
            if self.respond_to?(:user)
              self.user.update_spam_count
            end
          end
        end

      end

      def spammable?
        respond_to?(:flagged_as_spam)
      end
    end

    # it would be nice to use flagged_as_spam? directly
    # but GuideTaxon is a weird case of something that is spam
    # only because of association - its not directly flagged
    def known_spam?
      if self.is_a?(GuideTaxon)
        # guide taxa can have many sections, each of which could be spam,
        # so when one is spam consider the entire GuideTaxon as spam
        if self.guide_sections.any?{ |s| s.flagged_as_spam? }
          return true
        end
        return false
      end
      if (self.respond_to?(:flagged_as_spam?) && self.flagged_as_spam?)
        return true
      end
      false
    end

    def owned_by_spammer?
      user = if self.is_a?(User)
        self
      elsif self.respond_to?(:user)
        self.user
      end
      return true if user && user.spammer?
      false
    end

  end
end
